"""
CA証明書とサーバー証明書を生成するスクリプト。

使い方:
    pip install cryptography
    python scripts/maintenance/generate_cert.py

出力:
    certs/ca.key      CA秘密鍵（保管専用、配布しない）
    certs/ca.crt      CA証明書（クライアントPCにインストールする）
    certs/server.key  サーバー秘密鍵
    certs/server.crt  サーバー証明書（Gunicornに渡す）
"""
import datetime
import ipaddress
import pathlib

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

# ------------------------------------------------------------------ 設定
CERT_DIR = pathlib.Path(__file__).parent.parent.parent / "certs"
CA_ORG   = "Daiso Industry CA"
CA_CN    = "Daiso Industry Internal CA"
SRV_CN   = "syomohin"
SRV_IPS  = ["10.0.1.232", "127.0.0.1"]
SRV_SANS = ["localhost"]
VALID_DAYS_CA  = 3650   # CA証明書の有効期限（10年）
VALID_DAYS_SRV = 825    # サーバー証明書の有効期限（約2年）
# ------------------------------------------------------------------

CERT_DIR.mkdir(exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc)


def make_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def save_key(path: pathlib.Path, key: rsa.RSAPrivateKey) -> None:
    path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )


def save_cert(path: pathlib.Path, cert: x509.Certificate) -> None:
    path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))


# ------------------------------------------------------------------ CA証明書
print("CA証明書を生成中...")
ca_key = make_key()
save_key(CERT_DIR / "syomohin-ca.key", ca_key)

ca_name = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, "JP"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, CA_ORG),
    x509.NameAttribute(NameOID.COMMON_NAME, CA_CN),
])

ca_cert = (
    x509.CertificateBuilder()
    .subject_name(ca_name)
    .issuer_name(ca_name)
    .public_key(ca_key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(now)
    .not_valid_after(now + datetime.timedelta(days=VALID_DAYS_CA))
    .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
    .add_extension(
        x509.KeyUsage(
            digital_signature=True, key_cert_sign=True, crl_sign=True,
            content_commitment=False, key_encipherment=False,
            data_encipherment=False, key_agreement=False,
            encipher_only=False, decipher_only=False,
        ),
        critical=True,
    )
    .add_extension(
        x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),
        critical=False,
    )
    .sign(ca_key, hashes.SHA256())
)
save_cert(CERT_DIR / "syomohin-ca.crt", ca_cert)
print(f"  CA証明書: {CERT_DIR / 'syomohin-ca.crt'}")

# ------------------------------------------------------------------ サーバー証明書
print("サーバー証明書を生成中...")
srv_key = make_key()
save_key(CERT_DIR / "syomohin.key", srv_key)

srv_name = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, "JP"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, CA_ORG),
    x509.NameAttribute(NameOID.COMMON_NAME, SRV_CN),
])

san_entries: list[x509.GeneralName] = [x509.DNSName(d) for d in SRV_SANS]
san_entries += [x509.IPAddress(ipaddress.IPv4Address(ip)) for ip in SRV_IPS]

srv_cert = (
    x509.CertificateBuilder()
    .subject_name(srv_name)
    .issuer_name(ca_cert.subject)
    .public_key(srv_key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(now)
    .not_valid_after(now + datetime.timedelta(days=VALID_DAYS_SRV))
    .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
    .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
    .add_extension(
        x509.KeyUsage(
            digital_signature=True, key_encipherment=True,
            content_commitment=False, data_encipherment=False,
            key_agreement=False, key_cert_sign=False, crl_sign=False,
            encipher_only=False, decipher_only=False,
        ),
        critical=True,
    )
    .add_extension(
        x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
        critical=False,
    )
    .add_extension(
        x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
        critical=False,
    )
    .sign(ca_key, hashes.SHA256())
)
save_cert(CERT_DIR / "syomohin.crt", srv_cert)
print(f"  サーバー証明書: {CERT_DIR / 'syomohin.crt'}")

print()
print("完了! 次のステップ:")
print(f"  1. {CERT_DIR / 'syomohin-ca.crt'} を各クライアントPCにインストール")
print("     (Windowsの場合: syomohin-ca.crtをダブルクリック → 「信頼されたルート証明機関」へ)")
print("  2. docker-compose down && docker-compose build && docker-compose up -d")
print("  3. https://10.0.1.232:8504 でアクセス")
