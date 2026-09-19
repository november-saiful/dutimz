import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import {
  EMPTY_PAYLOAD_SHA256,
  amzDateString,
  buildCanonicalRequest,
  sha256Hex,
  signRequestV4,
  type SigV4Input,
  type SubtleCryptoLike,
} from "@/lib/upload/sigv4";

/**
 * The published AWS SigV4 test-suite "get-vanilla" vector — used here so the
 * signer is checked against an external reference, not just against itself.
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
 */
const AWS_VECTOR: SigV4Input = {
  method: "GET",
  host: "example.amazonaws.com",
  path: "/",
  payloadHash: EMPTY_PAYLOAD_SHA256,
  amzDate: "20150830T123600Z",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  service: "service",
};

// jsdom does not expose WebCrypto's SubtleCrypto, so tests inject Node's.
const subtle = webcrypto.subtle as unknown as SubtleCryptoLike;

describe("SigV4 canonical request", () => {
  it("matches the AWS reference canonical request", () => {
    const { canonicalRequest, signedHeaders } = buildCanonicalRequest(AWS_VECTOR);
    expect(signedHeaders).toBe("host;x-amz-date");
    expect(canonicalRequest).toBe(
      [
        "GET",
        "/",
        "",
        "host:example.amazonaws.com",
        "x-amz-date:20150830T123600Z",
        "",
        "host;x-amz-date",
        EMPTY_PAYLOAD_SHA256,
      ].join("\n"),
    );
  });

  it("sorts headers and collapses sequential spaces", () => {
    const { signedHeaders, canonicalRequest } = buildCanonicalRequest({
      ...AWS_VECTOR,
      headers: { "content-type": "image/webp", "x-amz-content-sha256": "abc" },
    });
    expect(signedHeaders).toBe("content-type;host;x-amz-content-sha256;x-amz-date");
    expect(canonicalRequest).toContain("content-type:image/webp\n");
  });

  it("encodes query parameters in canonical order", () => {
    const { canonicalRequest } = buildCanonicalRequest({
      ...AWS_VECTOR,
      query: "b=2&a=1",
    });
    expect(canonicalRequest.split("\n")[2]).toBe("a=1&b=2");
  });

  it("keeps slashes in the path but encodes each segment", () => {
    const { canonicalRequest } = buildCanonicalRequest({
      ...AWS_VECTOR,
      path: "/bucket/my file.webp",
    });
    expect(canonicalRequest.split("\n")[1]).toBe("/bucket/my%20file.webp");
  });
});

describe("signRequestV4", () => {
  it("reproduces the AWS reference signature", async () => {
    const result = await signRequestV4({ ...AWS_VECTOR, subtle });
    expect(result.credentialScope).toBe("20150830/us-east-1/service/aws4_request");
    expect(result.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, " +
        "SignedHeaders=host;x-amz-date, " +
        "Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("produces different signatures for different payloads", async () => {
    const a = await signRequestV4({ ...AWS_VECTOR, subtle });
    const b = await signRequestV4({ ...AWS_VECTOR, subtle, payloadHash: "0".repeat(64) });
    expect(a.signature).not.toBe(b.signature);
  });
});

describe("helpers", () => {
  it("hashes empty input to the SHA-256 empty constant", async () => {
    expect(await sha256Hex(new Uint8Array(), subtle)).toBe(EMPTY_PAYLOAD_SHA256);
  });

  it("formats a UTC basic-ISO timestamp", () => {
    expect(amzDateString(new Date("2015-08-30T12:36:00Z"))).toBe("20150830T123600Z");
  });
});
