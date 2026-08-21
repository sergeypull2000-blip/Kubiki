import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function createObjectStorage(config) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return {
    put: (key, body, contentType) => client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })),
    delete: (key) => client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })),
    signedGetUrl: (key) => getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { expiresIn: config.signedUrlTtlSeconds },
    ),
  };
}
