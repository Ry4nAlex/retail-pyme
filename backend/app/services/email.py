import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.core.config import settings


async def send_email(to: str, subject: str, html_body: str):
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print(f"[EMAIL] SMTP not configured. Would send to {to}: {subject}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM}>"
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
    )


async def send_password_reset_email(to: str, name: str, token: str, frontend_url: str = "http://localhost:3000"):
    reset_link = f"{frontend_url}/reset-password?token={token}"
    html = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Segoe UI', sans-serif; background:#f8fafc; margin:0; padding:40px 20px;">
      <div style="max-width:560px; margin:0 auto; background:white; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding:40px 40px 32px;">
          <h1 style="color:white; margin:0; font-size:24px; font-weight:700; letter-spacing:-0.5px;">RetailPyme</h1>
          <p style="color:rgba(255,255,255,0.7); margin:6px 0 0; font-size:13px;">Predictive Sales System</p>
        </div>
        <div style="padding:40px;">
          <h2 style="color:#1e293b; font-size:20px; margin:0 0 12px;">Password Reset Request</h2>
          <p style="color:#64748b; line-height:1.6; margin:0 0 28px;">Hi {name},<br><br>
          We received a request to reset the password for your account. Click the button below to proceed. This link is valid for <strong>30 minutes</strong>.</p>
          <a href="{reset_link}" style="display:inline-block; background:linear-gradient(135deg,#1e3a5f,#2563eb); color:white; text-decoration:none; padding:14px 32px; border-radius:8px; font-weight:600; font-size:15px;">Reset Password</a>
          <p style="color:#94a3b8; font-size:12px; margin-top:32px; line-height:1.6;">
            If you didn't request this, you can safely ignore this email.<br>
            If the button doesn't work, copy this link: <span style="color:#2563eb;">{reset_link}</span>
          </p>
        </div>
      </div>
    </body>
    </html>
    """
    await send_email(to, "Reset your RetailPyme password", html)
