import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

let s3Client;

function getConfig() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  const region = process.env.AWS_REGION || 'ap-south-1';
  const bucket = process.env.AWS_S3_BUCKET || '';
  const prefix = process.env.AWS_S3_PREFIX || 'counsellor-profile-images';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials are missing. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
  }
  if (!bucket) {
    throw new Error('S3 bucket is missing. Set AWS_S3_BUCKET.');
  }

  return { accessKeyId, secretAccessKey, region, bucket, prefix };
}

function getS3Client() {
  if (!s3Client) {
    const { accessKeyId, secretAccessKey, region } = getConfig();
    s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return s3Client;
}

export function isAllowedImageType(contentType) {
  return ALLOWED_IMAGE_TYPES.has(String(contentType || '').toLowerCase());
}

export function extensionForContentType(contentType) {
  return EXT_BY_TYPE[String(contentType || '').toLowerCase()] || '';
}

export function buildProfileImageKey(counsellorId, contentType) {
  const { prefix } = getConfig();
  const ext = extensionForContentType(contentType);
  const safeId = String(counsellorId).replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}/${safeId}/${Date.now()}${ext}`;
}

export function getApiBaseUrl() {
  return (process.env.API_BASE_URL || 'http://localhost:5001/api/v1').replace(/\/$/, '');
}

export function getProfileImageProxyUrl(counsellorId) {
  if (!counsellorId) return '';
  return `${getApiBaseUrl()}/counsellors/media/${counsellorId}/profile-image`;
}

export async function getObject(key) {
  const { bucket } = getConfig();
  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  return {
    body: response.Body,
    contentType: response.ContentType || 'application/octet-stream',
  };
}

export function extractS3Key(value) {
  if (!value) return '';
  if (!value.startsWith('http')) return value;
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

export function isProfileImageKeyForCounsellor(key, counsellorId) {
  const { prefix } = getConfig();
  const safeId = String(counsellorId).replace(/[^a-zA-Z0-9]/g, '');
  return key.startsWith(`${prefix}/${safeId}/`);
}

export async function uploadObject(key, body, contentType) {
  const { bucket } = getConfig();
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
}

export async function deleteObject(key) {
  if (!key) return;
  const { bucket } = getConfig();
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function enrichCounsellorProfileImage(counsellor) {
  const obj = counsellor?.toObject ? counsellor.toObject({ virtuals: true }) : { ...counsellor };
  obj.profileImageUrl = obj.profileImage ? getProfileImageProxyUrl(obj._id) : '';
  return obj;
}
