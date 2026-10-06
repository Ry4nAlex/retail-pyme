from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timedelta
import io
import hashlib
import hmac
import secrets
from uuid import UUID
import qrcode
from app.db.database import get_db
from app.models.models import Company, User
from app.schemas.schemas import (
    LoginRequest, TokenResponse, ForgotPasswordRequest,
    ResetPasswordRequest, ChangePasswordRequest, MessageResponse,
    BootstrapSuperAdminRequest, QRRecoveryRequest
)
from app.core.security import (
    verify_password, hash_password, create_access_token,
    generate_reset_token, get_current_user
)
from app.services.email import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["Authentication"])

def _hash_recovery_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _generate_recovery_code() -> str:
    # 12 caracteres aleatorios, mostrados en grupos para que sea fácil guardarlo.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(12))
    return f"RP-{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def _build_qr_png(recovery_url: str) -> bytes:
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(recovery_url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@router.post("/bootstrap-superadmin", response_model=MessageResponse, status_code=201)
async def bootstrap_superadmin(request: BootstrapSuperAdminRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.role == "superadmin"))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A super administrator already exists")
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres.")

    company = Company(
        name=request.company_name,
        tax_id=request.company_tax_id,
        industry="platform",
        city="Lima",
        country="Peru",
    )
    db.add(company)
    await db.flush()

    user = User(
        company_id=company.id,
        name=request.name,
        email=request.email,
        password_hash=hash_password(request.password),
        role="superadmin",
        active=True,
        email_verified=True,
    )
    db.add(user)
    return MessageResponse(message="Super administrator created")


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos."
        )

    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario se encuentra inactivo. Contacte con un administrador."
        )

    await db.execute(
        update(User).where(User.id == user.id).values(last_login=datetime.utcnow())
    )

    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "company_id": str(user.company_id),
        "name": user.name,
    })

    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "company_id": str(user.company_id),
        }
    )


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(request: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email, User.active == True))
    user = result.scalar_one_or_none()

    # Always return success to prevent email enumeration
    if user:
        token = generate_reset_token()
        expires = datetime.utcnow() + timedelta(minutes=30)
        await db.execute(
            update(User).where(User.id == user.id).values(
                password_reset_token=token,
                password_reset_expires=expires,
            )
        )
        await db.commit()
        try:
            await send_password_reset_email(user.email, user.name, token)
        except Exception as e:
            print(f"[EMAIL ERROR] {e}")

    return MessageResponse(message="Si existe una cuenta asociada a ese correo, se ha enviado un enlace de recuperación.")

@router.get("/recovery-qr/{user_id}")
async def generate_recovery_qr(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Genera/regenera el código personal de recuperación de un usuario.
    Solo admin/superadmin. El código se muestra una vez; en BD se guarda solo su hash.
    """
    if current_user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="No tiene permisos para generar códigos de recuperación.")

    try:
        target_user_id = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Identificador de usuario inválido.")

    result = await db.execute(select(User).where(User.id == target_user_id))
    user = result.scalar_one_or_none()

    if not user or not user.active:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if current_user.get("role") == "admin" and str(user.company_id) != str(current_user.get("company_id")):
        raise HTTPException(status_code=403, detail="No tiene permisos para gestionar la recuperación de este usuario.")

    recovery_code = _generate_recovery_code()
    recovery_code_hash = _hash_recovery_value(recovery_code)

    await db.execute(
        update(User).where(User.id == user.id).values(
            recovery_code_hash=recovery_code_hash,
            qr_recovery_token_hash=None,
            qr_recovery_created_at=None,
        )
    )
    await db.commit()

    return {
        "recovery_code": recovery_code,
        "message": "Código de recuperación generado. Entréguelo al usuario y guárdelo en un lugar seguro.",
    }


@router.post("/recovery-qr")
async def generate_self_service_recovery_qr(
    request: QRRecoveryRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Recuperación autoservicio: valida correo + código personal y emite un QR temporal.
    El QR anterior queda invalidado al generar uno nuevo.
    """
    result = await db.execute(
        select(User).where(User.email == request.email, User.active == True)
    )
    user = result.scalar_one_or_none()

    invalid_detail = "Los datos de recuperación no son válidos."

    if not user or not user.recovery_code_hash:
        raise HTTPException(status_code=400, detail=invalid_detail)

    candidate_code_hash = _hash_recovery_value(request.recovery_code.strip().upper())
    if not hmac.compare_digest(candidate_code_hash, user.recovery_code_hash):
        raise HTTPException(status_code=400, detail=invalid_detail)

    secret = secrets.token_urlsafe(32)
    secret_hash = _hash_recovery_value(secret)
    qr_token = f"qr.{user.id}.{secret}"

    await db.execute(
        update(User).where(User.id == user.id).values(
            qr_recovery_token_hash=secret_hash,
            qr_recovery_created_at=datetime.utcnow(),
        )
    )
    await db.commit()

    frontend_url = "https://retail-pyme.vercel.app"
    recovery_url = f"{frontend_url}/reset-password?token={qr_token}"
    png = _build_qr_png(recovery_url)

    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = None

    # Recuperación por correo
    result = await db.execute(
        select(User).where(
            User.password_reset_token == request.token,
            User.password_reset_expires > datetime.utcnow(),
            User.active == True,
        )
    )
    user = result.scalar_one_or_none()

    # Recuperación alternativa por QR
    if not user and request.token.startswith("qr."):
        parts = request.token.split(".", 2)
        if len(parts) == 3:
            _, raw_user_id, secret = parts
            try:
                qr_user_id = UUID(raw_user_id)
            except ValueError:
                qr_user_id = None

            if qr_user_id and secret:
                qr_result = await db.execute(
                    select(User).where(User.id == qr_user_id, User.active == True)
                )
                qr_user = qr_result.scalar_one_or_none()

                if qr_user and qr_user.qr_recovery_token_hash and qr_user.qr_recovery_created_at:
                    qr_expires = qr_user.qr_recovery_created_at + timedelta(minutes=10)
                    candidate_hash = _hash_recovery_value(secret)
                    if (
                        qr_expires > datetime.utcnow()
                        and hmac.compare_digest(candidate_hash, qr_user.qr_recovery_token_hash)
                    ):
                        user = qr_user

    if not user:
        raise HTTPException(status_code=400, detail="El enlace o código de recuperación no es válido o ya expiró.")

    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres.")

    await db.execute(
        update(User).where(User.id == user.id).values(
            password_hash=hash_password(request.new_password),
            password_reset_token=None,
            password_reset_expires=None,
            qr_recovery_token_hash=None,
            qr_recovery_created_at=None,
        )
    )
    await db.commit()

    return MessageResponse(message="Contraseña restablecida correctamente. Ya puedes iniciar sesión.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta.")

    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres.")

    await db.execute(
        update(User).where(User.id == user.id).values(
            password_hash=hash_password(request.new_password),
            password_reset_token=None,
            password_reset_expires=None,
            qr_recovery_token_hash=None,
            qr_recovery_created_at=None,
        )
    )
    await db.commit()

    return MessageResponse(message="Contraseña cambiada correctamente.")


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
