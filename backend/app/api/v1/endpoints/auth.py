from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timedelta
from app.db.database import get_db
from app.models.models import Company, User
from app.schemas.schemas import (
    LoginRequest, TokenResponse, ForgotPasswordRequest,
    ResetPasswordRequest, ChangePasswordRequest, MessageResponse,
    BootstrapSuperAdminRequest
)
from app.core.security import (
    verify_password, hash_password, create_access_token,
    generate_reset_token, get_current_user
)
from app.services.email import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/bootstrap-superadmin", response_model=MessageResponse, status_code=201)
async def bootstrap_superadmin(request: BootstrapSuperAdminRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.role == "superadmin"))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A super administrator already exists")
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

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

    return MessageResponse(message="If an account exists with that email, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(
            User.password_reset_token == request.token,
            User.password_reset_expires > datetime.utcnow(),
            User.active == True,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    await db.execute(
        update(User).where(User.id == user.id).values(
            password_hash=hash_password(request.new_password),
            password_reset_token=None,
            password_reset_expires=None,
        )
    )

    return MessageResponse(message="Password reset successfully. You can now log in.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    await db.execute(
        update(User).where(User.id == user.id).values(password_hash=hash_password(request.new_password))
    )

    return MessageResponse(message="Password changed successfully")


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
