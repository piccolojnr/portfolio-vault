"""Platform admin management commands."""

from __future__ import annotations

import typer

app = typer.Typer(help="Platform admin commands.")


def _get_sync_engine():
    from sqlalchemy import create_engine
    from memra.app.core.config import get_settings

    settings = get_settings()
    if not settings.database_url:
        typer.echo("ERROR: DATABASE_URL is not set", err=True)
        raise typer.Exit(1)
    return create_engine(settings.database_url)


@app.command("create-admin")
def create_admin(
    email: str = typer.Option(..., prompt=True, help="Admin email address"),
    name: str = typer.Option(..., prompt=True, help="Admin display name"),
    password: str = typer.Option(
        ..., prompt=True, confirmation_prompt=True, hide_input=True,
        help="Admin password (min 8 chars)",
    ),
    no_force_change: bool = typer.Option(
        False, "--no-force-change",
        help="Skip the must-change-password requirement on first login",
    ),
):
    """Create a new platform admin account."""
    import bcrypt
    from sqlalchemy import text

    if len(password) < 8:
        typer.echo("ERROR: Password must be at least 8 characters.", err=True)
        raise typer.Exit(1)

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()
    must_change = not no_force_change

    engine = _get_sync_engine()
    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM platform_admins WHERE email = :email"),
            {"email": email},
        ).fetchone()

        if existing:
            typer.echo(f"ERROR: Admin with email '{email}' already exists.", err=True)
            raise typer.Exit(1)

        conn.execute(
            text("""
                INSERT INTO platform_admins (email, password_hash, name, must_change_password)
                VALUES (:email, :hash, :name, :must_change)
            """),
            {"email": email, "hash": password_hash, "name": name, "must_change": must_change},
        )
        conn.commit()

    typer.echo(typer.style(f"\nAdmin '{email}' created.", fg=typer.colors.GREEN, bold=True))
    if must_change:
        typer.echo("  Password change will be required on first login.")


@app.command("list-admins")
def list_admins():
    """List all platform admin accounts."""
    from sqlalchemy import text

    engine = _get_sync_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, email, name, must_change_password, created_at, last_login_at FROM platform_admins ORDER BY created_at")
        ).fetchall()

    if not rows:
        typer.echo("No platform admins found.")
        return

    typer.echo(f"{'Email':35s} {'Name':20s} {'Created':12s} {'Last Login':12s} {'Must Change'}")
    typer.echo("-" * 95)
    for r in rows:
        last_login = r[5].strftime("%Y-%m-%d") if r[5] else "never"
        created = r[4].strftime("%Y-%m-%d") if r[4] else ""
        typer.echo(f"{r[1]:35s} {r[2]:20s} {created:12s} {last_login:12s} {str(r[3])}")


@app.command("reset-admin-password")
def reset_admin_password(
    email: str = typer.Option(..., prompt=True, help="Admin email address"),
    password: str = typer.Option(
        ..., prompt=True, confirmation_prompt=True, hide_input=True,
        help="New password (min 8 chars)",
    ),
):
    """Reset a platform admin's password."""
    import bcrypt
    from sqlalchemy import text

    if len(password) < 8:
        typer.echo("ERROR: Password must be at least 8 characters.", err=True)
        raise typer.Exit(1)

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()

    engine = _get_sync_engine()
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                UPDATE platform_admins
                SET password_hash = :hash, must_change_password = false
                WHERE email = :email
                RETURNING id
            """),
            {"hash": password_hash, "email": email},
        )
        if result.rowcount == 0:
            typer.echo(f"ERROR: No admin found with email '{email}'.", err=True)
            raise typer.Exit(1)
        conn.commit()

    typer.echo(typer.style(f"\nPassword reset for '{email}'.", fg=typer.colors.GREEN, bold=True))
