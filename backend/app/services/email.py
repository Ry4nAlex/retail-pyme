import asyncio
import json
import os
import urllib.error
import urllib.request


BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def _send_brevo_request(payload: dict, api_key: str):
    data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        BREVO_API_URL,
        data=data,
        method="POST",
        headers={
            "accept": "application/json",
            "api-key": api_key,
            "content-type": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read()


async def send_email(to: str, subject: str, html_body: str):
    api_key = os.getenv("BREVO_API_KEY")
    from_email = os.getenv("BREVO_FROM_EMAIL")
    from_name = os.getenv("BREVO_FROM_NAME", "RetailPyme")

    if not api_key or not from_email:
        raise RuntimeError(
            "Brevo no está configurado. Faltan BREVO_API_KEY o BREVO_FROM_EMAIL."
        )

    payload = {
        "sender": {
            "name": from_name,
            "email": from_email,
        },
        "to": [
            {
                "email": to,
            }
        ],
        "subject": subject,
        "htmlContent": html_body,
    }

    try:
        await asyncio.to_thread(
            _send_brevo_request,
            payload,
            api_key,
        )

        print(f"[EMAIL] Correo enviado correctamente a {to} mediante Brevo.")

    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")

        print(
            f"[EMAIL ERROR] Brevo respondió HTTP {exc.code}: {error_body}"
        )

        raise RuntimeError(
            f"No se pudo enviar el correo mediante Brevo (HTTP {exc.code})."
        ) from exc

    except urllib.error.URLError as exc:
        print(f"[EMAIL ERROR] No se pudo conectar con Brevo: {exc.reason}")

        raise RuntimeError(
            "No se pudo conectar con el servicio de correo."
        ) from exc

    except Exception as exc:
        print(f"[EMAIL ERROR] Error inesperado al enviar correo: {exc}")
        raise


async def send_password_reset_email(
    to: str,
    name: str,
    token: str,
    frontend_url: str = "https://retail-pyme.vercel.app",
):
    reset_link = f"{frontend_url}/reset-password?token={token}"

    html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <body style="font-family:'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:40px 20px;">
      <div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:40px 40px 32px;">
          <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">
            RetailPyme
          </h1>

          <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px;">
            Gestión inteligente de inventario
          </p>
        </div>

        <div style="padding:40px;">
          <h2 style="color:#1e293b;font-size:20px;margin:0 0 12px;">
            Restablecimiento de contraseña
          </h2>

          <p style="color:#64748b;line-height:1.6;margin:0 0 28px;">
            Hola {name},<br><br>
            Recibimos una solicitud para restablecer la contraseña de tu cuenta.
            El siguiente enlace será válido durante
            <strong>30 minutos</strong>.
          </p>

          <a
            href="{reset_link}"
            style="display:inline-block;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;"
          >
            Restablecer contraseña
          </a>

          <p style="color:#94a3b8;font-size:12px;margin-top:32px;line-height:1.6;">
            Si no solicitaste este cambio, puedes ignorar este correo.<br><br>
            Si el botón no funciona, copia este enlace:<br>
            <span style="color:#2563eb;">{reset_link}</span>
          </p>
        </div>

      </div>
    </body>
    </html>
    """

    await send_email(
        to,
        "Restablece tu contraseña de RetailPyme",
        html,
    )
