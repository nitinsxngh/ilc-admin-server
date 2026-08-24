import {
  DeleteObjectCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  GetPublicAccessBlockCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3';

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

export function isAllowedPdfType(contentType, originalName = '') {
  const type = String(contentType || '').toLowerCase();
  const name = String(originalName || '').toLowerCase();
  return type === 'application/pdf' || name.endsWith('.pdf');
}

function sanitizeFileName(name) {
  return String(name || 'document.pdf')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export function buildELibraryThumbnailKey(documentId) {
  const prefix = process.env.AWS_S3_ELIBRARY_PREFIX || 'e-library-documents';
  const safeId = String(documentId).replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}/thumbnails/${safeId}/${Date.now()}.jpg`;
}

export function buildELibraryDocumentKey(documentId, originalName) {
  const prefix = process.env.AWS_S3_ELIBRARY_PREFIX || 'e-library-documents';
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeId = String(documentId).replace(/[^a-zA-Z0-9]/g, '');
  const fileName = sanitizeFileName(originalName).replace(/\.pdf$/i, '') || 'document';
  return `${prefix}/${year}/${month}/${safeId}/${Date.now()}-${fileName}.pdf`;
}

export function getPublicObjectUrl(key) {
  const rawKey = extractS3Key(key);
  if (!rawKey) return '';
  const encoded = rawKey.split('/').map(encodeURIComponent).join('/');
  const override = String(process.env.AWS_S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (override) return `${override}/${encoded}`;
  const { bucket, region } = getConfig();
  return `https://${bucket}.s3.${region}.amazonaws.com/${encoded}`;
}

export function getELibraryFileProxyUrl(documentId, download = false) {
  if (!documentId) return '';
  const suffix = download ? '?download=1' : '';
  return `${getApiBaseUrl()}/e-library/${documentId}/file${suffix}`;
}

export function enrichELibraryDocument(doc) {
  const obj = doc?.toObject ? doc.toObject() : { ...doc };
  obj.fileUrl = obj.s3Key ? getPublicObjectUrl(obj.s3Key) : '';
  obj.downloadUrl = obj.fileUrl;
  obj.thumbnailUrl = obj.thumbnailS3Key ? getPublicObjectUrl(obj.thumbnailS3Key) : '';
  return obj;
}

const PUBLIC_MEDIA_PREFIXES = [
  {
    sid: 'PublicReadELibraryDocuments',
    envKey: 'AWS_S3_ELIBRARY_PREFIX',
    fallback: 'e-library-documents',
  },
  {
    sid: 'PublicReadCounsellorProfileImages',
    envKey: 'AWS_S3_PREFIX',
    fallback: 'counsellor-profile-images',
  },
];

let publicMediaAccessPromise;

export function ensureELibraryPublicAccess() {
  return ensurePublicMediaAccess();
}

export function ensurePublicMediaAccess() {
  if (!publicMediaAccessPromise) {
    publicMediaAccessPromise = applyPublicMediaAccess().catch((err) => {
      publicMediaAccessPromise = null;
      console.warn('Could not make S3 media prefixes public:', err.message);
    });
  }
  return publicMediaAccessPromise;
}

async function applyPublicMediaAccess() {
  const { bucket } = getConfig();
  const client = getS3Client();

  try {
    const current = await client.send(new GetPublicAccessBlockCommand({ Bucket: bucket }));
    const block = current.PublicAccessBlockConfiguration || {};
    if (block.BlockPublicPolicy || block.RestrictPublicBuckets) {
      await client.send(
        new PutPublicAccessBlockCommand({
          Bucket: bucket,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: block.BlockPublicAcls ?? true,
            IgnorePublicAcls: block.IgnorePublicAcls ?? true,
            BlockPublicPolicy: false,
            RestrictPublicBuckets: false,
          },
        })
      );
    }
  } catch (err) {
    if (err.name !== 'NoSuchPublicAccessBlockConfiguration') {
      console.warn('Could not update S3 public access block:', err.message);
    }
  }

  let policy = { Version: '2012-10-17', Statement: [] };
  try {
    const current = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
    policy = JSON.parse(current.Policy || '{}');
    if (!Array.isArray(policy.Statement)) {
      policy.Statement = policy.Statement ? [policy.Statement] : [];
    }
    if (!policy.Version) policy.Version = '2012-10-17';
  } catch (err) {
    if (err.name !== 'NoSuchBucketPolicy' && err.$metadata?.httpStatusCode !== 404) {
      throw err;
    }
  }

  let changed = false;
  for (const item of PUBLIC_MEDIA_PREFIXES) {
    const prefix = process.env[item.envKey] || item.fallback;
    const resource = `arn:aws:s3:::${bucket}/${prefix}/*`;
    if (policy.Statement.some((statement) => statement.Sid === item.sid)) continue;
    policy.Statement.push({
      Sid: item.sid,
      Effect: 'Allow',
      Principal: '*',
      Action: 's3:GetObject',
      Resource: resource,
    });
    changed = true;
  }

  if (changed) {
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify(policy),
      })
    );
  }
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

export async function uploadObject(key, body, contentType, options = {}) {
  const { bucket } = getConfig();
  const command = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  };
  if (options.publicRead) {
    command.ContentDisposition = options.contentDisposition || 'inline';
    await ensurePublicMediaAccess();
  }
  await getS3Client().send(new PutObjectCommand(command));
}

export async function deleteObject(key) {
  if (!key) return;
  const { bucket } = getConfig();
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function enrichCounsellorProfileImage(counsellor) {
  const obj = counsellor?.toObject ? counsellor.toObject({ virtuals: true }) : { ...counsellor };
  if (!obj.profileImage) {
    obj.profileImageUrl = '';
    obj.profileImagePublicUrl = '';
    return obj;
  }
  obj.profileImagePublicUrl = getPublicObjectUrl(obj.profileImage);
  obj.profileImageUrl = getProfileImageProxyUrl(obj._id);
  return obj;
}
