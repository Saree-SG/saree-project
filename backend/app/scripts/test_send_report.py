"""
Test script — gửi thử báo cáo Excel qua email ngay lập tức.

Usage:
    # Dev
    docker exec saree-dev-backend-1 python -m app.scripts.test_send_report

    # Prod
    docker exec saree-prod-backend-1 python -m app.scripts.test_send_report

    # Gửi tới email khác (ghi đè REPORT_RECIPIENTS)
    docker exec saree-dev-backend-1 python -m app.scripts.test_send_report test@example.com
"""

from __future__ import annotations

import sys

from app.core.config import settings
from app.jobs.daily_jobs import _build_excel_report, _get_report_recipients

import emails as emails_lib  # type: ignore
from datetime import datetime, timezone


def main() -> None:
    # Cho phép override recipients từ CLI arg
    if len(sys.argv) > 1:
        recipients = [e.strip() for e in sys.argv[1].split(",") if e.strip()]
    else:
        recipients = _get_report_recipients()

    print(f"📧 SMTP host  : {settings.SMTP_HOST}")
    print(f"📧 SMTP user  : {settings.SMTP_USER}")
    print(f"📧 From email : {settings.EMAILS_FROM_EMAIL}")
    print(f"📧 Recipients : {recipients}")
    print(f"📧 Email enabled: {settings.emails_enabled}")

    if not settings.emails_enabled:
        print("\n❌ Email chưa được cấu hình (SMTP_HOST hoặc EMAILS_FROM_EMAIL trống)")
        print("   Kiểm tra lại .env hoặc GitHub Secrets: SMTP_HOST, SMTP_USER, SMTP_PASSWORD")
        sys.exit(1)

    if not recipients:
        print("\n❌ Không có recipient nào (REPORT_RECIPIENTS trống)")
        sys.exit(1)

    print("\n⏳ Đang tạo file Excel...")
    excel_bytes = _build_excel_report()
    if not excel_bytes:
        print("❌ Không có dữ liệu để export (chưa có công ty nào?)")
        sys.exit(1)
    print(f"✓ Excel tạo xong ({len(excel_bytes) / 1024:.1f} KB)")

    today_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    filename = f"saree_bao_cao_test_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.xlsx"

    html_content = f"""
    <html><body style="font-family: Calibri, Arial, sans-serif; color: #333;">
    <h2 style="color: #1F3864;">📊 [TEST] Báo cáo Saree ERP</h2>
    <p>Đây là email <strong>test</strong> gửi thủ công lúc {today_str}.</p>
    <p>Báo cáo bao gồm:</p>
    <ul>
        <li>📊 Tổng quan & phân tích KPI</li>
        <li>👥 Danh sách nhân sự & vai trò</li>
        <li>✅ Danh sách task (trạng thái, tiến độ)</li>
        <li>📁 Danh sách dự án</li>
        <li>📈 Báo cáo hoạt động theo tháng</li>
    </ul>
    <p style="color: #888; font-size: 12px;">Test script từ hệ thống Saree ERP.</p>
    </body></html>
    """

    smtp_options: dict = {"host": settings.SMTP_HOST, "port": settings.SMTP_PORT}
    if settings.SMTP_TLS:
        smtp_options["tls"] = True
    elif settings.SMTP_SSL:
        smtp_options["ssl"] = True
    if settings.SMTP_USER:
        smtp_options["user"] = settings.SMTP_USER
    if settings.SMTP_PASSWORD:
        smtp_options["password"] = settings.SMTP_PASSWORD

    print(f"\n⏳ Đang gửi tới {len(recipients)} recipient(s)...")
    for recipient in recipients:
        msg = emails_lib.Message(
            subject=f"[TEST] Báo cáo Saree ERP {today_str}",
            html=html_content,
            mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
        )
        msg.attach(
            filename=filename,
            content_disposition="attachment",
            data=excel_bytes,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response = msg.send(to=recipient, smtp=smtp_options)
        status = "✓" if response.status_code == 250 else "❌"
        print(f"  {status} {recipient} → HTTP {response.status_code}")

    print("\n✅ Xong!")


if __name__ == "__main__":
    main()
