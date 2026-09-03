import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// This service issues short-lived, signed URLs so the browser can upload
// large video/PDF files DIRECTLY to the CDN/storage provider — the file
// never passes through our own API server.
@Injectable()
export class MediaService {
  constructor(private config: ConfigService) {}

  // ---------- Video (Bunny.net Stream) ----------

  // 1. Backend creates a "video" placeholder in Bunny's library and
  //    returns a signed one-time upload URL + the resulting videoId.
  // 2. Frontend PUTs the file bytes directly to that URL.
  // 3. Frontend then saves `playbackUrl` on the Lesson via
  //    PATCH /lessons/:id (curriculum module).
  async createVideoUploadUrl(title: string) {
    const libraryId = this.config.get<string>('BUNNY_STREAM_LIBRARY_ID');
    const apiKey = this.config.get<string>('BUNNY_STREAM_API_KEY');

    // NOTE: This is a placeholder implementation showing the shape of
    // the integration. Actual Bunny Stream video creation happens via
    // a server-side POST to their "Create Video" API using apiKey,
    // which returns a videoId — then the upload URL is constructed
    // from libraryId + videoId per Bunny's docs. Wire this up with a
    // real HTTP call (fetch/axios) once Bunny credentials are set in .env.
    const videoId = crypto.randomUUID();

    return {
      videoId,
      uploadUrl: `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      playbackUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`,
      // In production, generate a real AuthorizationSignature per Bunny's
      // TUS/direct-upload docs instead of returning the raw apiKey.
      note: 'Placeholder response — wire real Bunny Stream API call before use.',
    };
  }

  // ---------- Files (S3-compatible: readings, assignment attachments) ----------

  async createFileUploadUrl(fileName: string, contentType: string) {
    const bucket = this.config.get<string>('S3_BUCKET');
    const key = `uploads/${Date.now()}-${fileName}`;

    // Placeholder — swap for a real presigned URL using the AWS SDK
    // (S3Client + getSignedUrl from @aws-sdk/s3-request-presigner) or
    // the Backblaze B2 equivalent, using S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY
    // from the env file set up in Phase 0.
    return {
      uploadUrl: `https://${bucket}.s3.amazonaws.com/${key}`,
      fileUrl: `https://${bucket}.s3.amazonaws.com/${key}`,
      key,
      note: 'Placeholder response — wire real S3 presigned URL generation before use.',
    };
  }
}
