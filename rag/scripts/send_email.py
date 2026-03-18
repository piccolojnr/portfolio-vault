#!/usr/bin/env python3
"""
Simple script to send emails using the portfolio-rag infrastructure.
Usage: python scripts/send_email.py <template_name> --to <recipient> [--context '{"key": "value"}']
"""

import asyncio
import json
import argparse
import sys
import os

# Add src to path so we can import portfolio_rag
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from portfolio_rag.infrastructure.email import get_renderer, get_email_backend
from portfolio_rag.app.core.config import get_settings

async def main():
    parser = argparse.ArgumentParser(description="Send an email using a template.")
    parser.add_argument("template", help="Name of the template file (e.g., welcome.html)")
    parser.add_argument("--to", required=True, help="Recipient email address")
    parser.add_argument("--context", help="JSON string of context variables for the template")
    
    args = parser.parse_args()
    
    settings = get_settings()
    renderer = get_renderer()
    backend = get_email_backend()
    
    # Base context from settings
    context = {
        "to": args.to,
        "app_name": settings.app_name,
        "app_url": settings.app_url,
    }
    
    # Merge custom context if provided
    if args.context:
        try:
            custom_context = json.loads(args.context)
            context.update(custom_context)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON context: {e}")
            sys.exit(1)
            
    try:
        print(f"Rendering template '{args.template}' for {args.to}...")
        message = renderer.render(args.template, context)
        
        print(f"Sending email: '{message.subject}' to {message.to} using {backend.__class__.__name__}...")
        await backend.send(message)
        print("Done!")
        
    except Exception as e:
        print(f"Error sending email: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
