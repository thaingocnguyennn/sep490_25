#!/usr/bin/env python3
"""
verify_pdf_signature.py
Module xác thực chữ ký số và tính toàn vẹn PDF chuẩn ISO 32000 / PAdES sử dụng pyHanko.
Hỗ trợ kiểm tra:
1. Hash intact (mã băm nội dung khớp)
2. Signature valid (chữ ký mật mã CMS hợp lệ)
3. Certificate trusted & revoked (chuỗi CA tin cậy và kiểm tra thu hồi)
4. Modification level & DocMDP policy (mức thay đổi sau khi ký và tính hợp lệ theo chính sách)
5. Trusted TSA timestamp vs Signer reported time
6. Bottom line overall validity
"""

import sys
import json
import os
import argparse

def verify_pdf_signature(pdf_path: str, trusted_root_path: str = None):
    try:
        from pyhanko.keys import load_cert_from_pemder
        from pyhanko_certvalidator import ValidationContext
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko.sign.diff_analysis.policy_api import ModificationLevel
    except ImportError as e:
        return {
            "signed": False,
            "error": f"Missing required pyHanko dependencies: {str(e)}",
            "signatures": [],
            "allSignaturesValid": False,
            "signatureCount": 0
        }

    validation_context = None
    if trusted_root_path and os.path.exists(trusted_root_path):
        try:
            root_cert = load_cert_from_pemder(trusted_root_path)
            validation_context = ValidationContext(
                trust_roots=[root_cert],
                allow_fetching=True
            )
        except Exception as e:
            sys.stderr.write(f"Warning: Failed to load root certificate: {e}\n")

    if not os.path.exists(pdf_path):
        return {
            "signed": False,
            "error": f"File not found: {pdf_path}",
            "signatures": [],
            "allSignaturesValid": False,
            "signatureCount": 0
        }

    try:
        with open(pdf_path, "rb") as pdf_file:
            reader = PdfFileReader(pdf_file)
            signatures = reader.embedded_signatures
            if not signatures:
                return {
                    "signed": False,
                    "message": "PDF does not contain a digital signature",
                    "signatures": [],
                    "allSignaturesValid": False,
                    "signatureCount": 0
                }

            results = []
            for index, embedded_signature in enumerate(signatures):
                try:
                    status = validate_pdf_signature(
                        embedded_signature,
                        signer_validation_context=validation_context,
                        ts_validation_context=validation_context,
                        skip_diff=False
                    )

                    certificate = status.signing_cert
                    modification_level = status.modification_level
                    timestamp = None
                    timestamp_valid = None

                    if status.timestamp_validity:
                        if hasattr(status.timestamp_validity, 'timestamp') and status.timestamp_validity.timestamp:
                            timestamp = status.timestamp_validity.timestamp.isoformat()
                        timestamp_valid = bool(
                            getattr(status.timestamp_validity, 'intact', False) and 
                            getattr(status.timestamp_validity, 'valid', False)
                        )

                    signer_name = None
                    cert_issuer = None
                    serial_number = None

                    if certificate:
                        subj = certificate.subject
                        subj_cn = None
                        if hasattr(subj, 'native') and isinstance(subj.native, dict):
                            subj_cn = subj.native.get('common_name')
                        if not subj_cn:
                            subj_cn = getattr(subj, 'human_friendly', str(subj))

                        issuer_obj = certificate.issuer
                        iss_cn = None
                        if hasattr(issuer_obj, 'native') and isinstance(issuer_obj.native, dict):
                            iss_cn = issuer_obj.native.get('common_name')
                        if not iss_cn:
                            iss_cn = getattr(issuer_obj, 'human_friendly', str(issuer_obj))

                        signer_name = subj_cn
                        cert_issuer = iss_cn
                        serial_number = str(certificate.serial_number)

                    results.append({
                        "index": index,
                        "fieldName": embedded_signature.field_name,
                        # Kiểm tra mật mã
                        "hashIntact": status.intact,
                        "signatureValid": status.valid,
                        # Kiểm tra chứng thư
                        "certificateTrusted": status.trusted if validation_context else None,
                        "certificateRevoked": status.revoked if validation_context else None,
                        # Kiểm tra thay đổi sau khi ký
                        "modifiedAfterSigning": (
                            modification_level != ModificationLevel.NONE
                            if modification_level is not None else False
                        ),
                        "modificationLevel": (
                            modification_level.name
                            if modification_level is not None else "NONE"
                        ),
                        "modificationAllowed": bool(status.docmdp_ok),
                        "coverage": (
                            status.coverage.name
                            if status.coverage is not None else "ENTIRE_FILE"
                        ),
                        # Kết luận tổng hợp (bottom_line)
                        "overallValid": bool(status.bottom_line),
                        # Người ký & Chứng thư
                        "signer": signer_name,
                        "certificateIssuer": cert_issuer,
                        "serialNumber": serial_number,
                        # Thời gian
                        "trustedTimestamp": timestamp,
                        "timestampValid": timestamp_valid,
                        "signerReportedTime": (
                            status.signer_reported_dt.isoformat()
                            if status.signer_reported_dt else None
                        )
                    })
                except Exception as sig_err:
                    results.append({
                        "index": index,
                        "fieldName": getattr(embedded_signature, 'field_name', f"Signature{index+1}"),
                        "error": str(sig_err),
                        "overallValid": False,
                        "hashIntact": False,
                        "signatureValid": False
                    })

            return {
                "signed": True,
                "signatureCount": len(results),
                "allSignaturesValid": all(result.get("overallValid", False) for result in results),
                "signatures": results
            }
    except Exception as e:
        return {
            "signed": False,
            "error": f"Error parsing PDF signatures: {str(e)}",
            "signatures": [],
            "allSignaturesValid": False,
            "signatureCount": 0
        }

def main():
    parser = argparse.ArgumentParser(description="Verify PDF digital signatures and integrity using pyHanko.")
    parser.add_argument("--pdf", required=True, help="Path to PDF file")
    parser.add_argument("--trusted-root", required=False, help="Path to trusted root CA certificate (PEM/DER)")
    args = parser.parse_args()

    result = verify_pdf_signature(args.pdf, args.trusted_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
