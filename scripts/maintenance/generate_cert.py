"""
自己署名SSL証明書を生成するスクリプト
"""
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import datetime
import pathlib
import ipaddress

# 証明書の保存先
cert_dir = pathlib.Path(".streamlit")
cert_dir.mkdir(exist_ok=True)

# 秘密鍵を生成
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
)

# 秘密鍵をファイルに保存
with open(cert_dir / "key.pem", "wb") as f:
    f.write(private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    ))

# 証明書の主体名を設定
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, "JP"),
    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Tokyo"),
    x509.NameAttribute(NameOID.LOCALITY_NAME, "Tokyo"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Dev"),
    x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
])

# 証明書を生成
cert = x509.CertificateBuilder().subject_name(
    subject
).issuer_name(
    issuer
).public_key(
    private_key.public_key()
).serial_number(
    x509.random_serial_number()
).not_valid_before(
    datetime.datetime.utcnow()
).not_valid_after(
    datetime.datetime.utcnow() + datetime.timedelta(days=365)
).add_extension(
    x509.SubjectAlternativeName([
        x509.DNSName("localhost"),
        x509.DNSName("*.local"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
        x509.IPAddress(ipaddress.IPv4Address("10.0.1.194")),
    ]),
    critical=False,
).sign(private_key, hashes.SHA256())

# 証明書をファイルに保存
with open(cert_dir / "cert.pem", "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))

print("✓ SSL証明書を生成しました:")
print(f"  - 秘密鍵: {cert_dir / 'key.pem'}")
print(f"  - 証明書: {cert_dir / 'cert.pem'}")
