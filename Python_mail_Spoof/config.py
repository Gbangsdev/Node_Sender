import smtplib
import ssl
import socket

def get_smtp_connection(host, port, user, password, timeout=30):
    """
    Enhanced SMTP connection with better error handling for 2026
    Supports both SSL and STARTTLS
    """
    context = ssl.create_default_context()
    
    # Set socket timeout
    socket.setdefaulttimeout(timeout)
    
    try:
        if port == 465:
            # SSL/TLS connection
            server = smtplib.SMTP_SSL(host, port, context=context, timeout=timeout)
        elif port == 587 or port == 25:
            # STARTTLS connection
            server = smtplib.SMTP(host, port, timeout=timeout)
            server.starttls(context=context)
        else:
            # Plain connection (not recommended)
            server = smtplib.SMTP(host, port, timeout=timeout)
        
        # Login
        server.login(user, password)
        
        return server
    except smtplib.SMTPAuthenticationError as e:
        raise ConnectionError(f"SMTP Authentication Failed: {e}")
    except smtplib.SMTPException as e:
        raise ConnectionError(f"SMTP Error: {e}")
    except socket.timeout:
        raise ConnectionError(f"Connection Timeout: Could not connect to {host}:{port}")
    except Exception as e:
        raise ConnectionError(f"Connection Failed: {e}")
