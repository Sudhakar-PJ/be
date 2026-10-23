# Project #4: Distributed Video Streaming & Media Transcoding Pipeline

> **Role in Series:** The Async Pipeline & Worker Project.  
> **Domain Analogy:** A production-grade media processing and delivery platform (YouTube / Netflix / Vimeo media backend).  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
Processing media at scale introduces heavy I/O and CPU bottlenecks:
1. **Application Memory Crashes:** Streaming multi-gigabyte video uploads directly through standard Node.js Express endpoints loads buffers into RAM, causing event loop starvation and `ERR_BUFFER_TOO_LARGE` crashes.
2. **CPU-Intensive Transcoding:** Running FFmpeg encoding tasks directly inside the main web server process blocks the single-threaded Node.js event loop, preventing all incoming HTTP traffic from being served.
3. **Bandwidth Inefficiencies & Client Buffering:** Delivering raw MP4 files causes long start times, high bandwidth usage, and stalling on mobile connections.
4. **Flaky Network Uploads:** If a mobile user loses connection at 98% of a 2 GB video upload, standard multipart uploads fail completely, forcing the user to restart from 0%.

### The Solution
A **Decoupled Asynchronous Processing Architecture**. Clients upload chunked files directly to **S3-compatible Object Storage (Cloudflare R2 / MinIO)** using **Presigned URLs** or the **tus resumable upload protocol**. Background worker pools consume transcoding jobs via **Redis Streams / BullMQ**, transcode video into **HLS (HTTP Live Streaming) adaptive bitrate playlists (`.m3u8` and `.ts` segments)** using **FFmpeg**, and deliver segments via CDN with byte-range caching.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | Presigned S3 URLs for Direct Uploads | Bypasses the application server entirely for uploads. Node.js processes zero upload bytes in memory. | Streaming file uploads through Express backend (crashes RAM). |
| **ADR-0002** | Resumable Uploads via tus Protocol | Enables pausing, resuming, and retrying chunked uploads across network dropouts. | Standard multipart form uploads. |
| **ADR-0003** | HLS Adaptive Bitrate Transcoding | Dynamically adapts video quality (360p, 720p, 1080p) to the viewer's network bandwidth in real time. | Single static MP4 files (buffers continuously on slow networks). |
| **ADR-0004** | Dedicated Worker Threads & Container Workers | Isolates CPU-heavy FFmpeg processes so the web API event loop maintains sub-10ms response times. | Running FFmpeg child processes directly in HTTP server process. |
| **ADR-0005** | BRIN Indexes on Time-Series Metrics in PostgreSQL | Block Range Indexes take 95% less disk space than B-Trees for naturally ordered log and playback metrics. | Standard B-Tree indexes on massive append-only metrics tables. |
| **ADR-0006** | MongoDB for Polymorphic Video Metadata | Accommodates variable audio tracks, subtitles, chapters, resolution profiles, and codec metadata. | Relational normalization with 8 join tables for encoding profiles. |

---

## 3. Back-of-the-Envelope Capacity Planning

| Metric | Target | Derived Math & Constraints |
|---|---|---|
| **Daily Video Uploads** | 2,000 Videos / Day | Average size: 500 MB raw = 1 TB raw ingest / day. |
| **Transcoded Egress Storage** | ~2.5 TB / Day | Each video transcoded into 360p, 720p, 1080p = 2.5x raw size. |
| **Transcoding Worker Pool** | 10 Parallel Worker Slots | Average transcode duration: 4 minutes per video. 2,000 * 4 min = 8,000 worker-minutes / day (easily cleared by 10 workers). |
| **HLS Segment Duration** | 6 Seconds per `.ts` file | Standard industry balance between CDN caching efficiency and playback start latency. |
| **Redis Job Queue Memory** | < 100 MB | Storing job metadata and status hashes in Redis. |

---

## 4. System Architecture & Ingestion Pipeline

```
[Client / Mobile App]
       │
       │ 1. Request Presigned Upload URL (POST /api/v1/videos/upload-intent)
       ▼
┌─────────────────────────────────┐
│ Express API Gateway             │
│  • Validates metadata (Zod)     │
│  • Generates S3 Presigned URL   │
│  • Creates video record (Mongo) │
└──────────────┬──────────────────┘
               │
               │ 2. Direct Chunked Upload (PUT /raw-videos/video-123.mp4)
               ▼
┌─────────────────────────────────┐
│ Object Storage (Cloudflare R2)  │
│ (Raw Ingestion Bucket)          │
└──────────────┬──────────────────┘
               │
               │ 3. S3 ObjectCreated Webhook / API Completion Notification
               ▼
┌─────────────────────────────────┐
│ Express API Gateway             │
│  • Enqueues Transcode Task      │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ Redis Streams / BullMQ          │
│ (Job Queue: `video:transcode`)  │
└──────────────┬──────────────────┘
               │
               ▼ (Worker Polls Task)
┌────────────────────────────────────────────────────────────────────────┐
│ Transcoding Worker (FFmpeg)                                            │
│  1. Downloads raw MP4 from R2                                          │
│  2. Extracts thumbnail & posters                                       │
│  3. Encodes to HLS:                                                    │
│     - 360p  (600 kbps)  + master.m3u8                                  │
│     - 720p  (2500 kbps)                                                │
│     - 1080p (5000 kbps)                                                │
│  4. Uploads .m3u8 playlists & .ts chunks to Public Stream Bucket       │
│  5. Updates MongoDB state to 'READY'                                   │
│  6. Emits completion push notification (ntfy)                          │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CDN Edge / Cloudflare Caching                                          │
│  • Serves HLS playlists and video chunks to end-users                  │
│  • Byte-range requests (`206 Partial Content`)                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Storage Schemas & Data Modeling

### MongoDB Document Schema (Video Metadata)
```json
{
  "_id": "018f2d5a-89a1-7c9b-b234-56789abcdef0",
  "userId": "018f2d5a-1111-7c9b-b234-56789abcdef0",
  "title": "Introduction to Distributed Systems",
  "status": "READY",
  "durationSeconds": 742.5,
  "rawVideo": {
    "bucket": "raw-videos",
    "key": "uploads/018f2d5a-89a1.mp4",
    "sizeBytes": 524288000
  },
  "renditions": [
    { "resolution": "1080p", "bitrate": 5000000, "playlistUrl": "/hls/1080p/index.m3u8" },
    { "resolution": "720p", "bitrate": 2500000, "playlistUrl": "/hls/720p/index.m3u8" },
    { "resolution": "360p", "bitrate": 600000, "playlistUrl": "/hls/360p/index.m3u8" }
  ],
  "hlsMasterPlaylistUrl": "/hls/master.m3u8",
  "thumbnailUrl": "/thumbnails/poster.jpg",
  "createdAt": "2026-10-23T10:00:00.000Z"
}
```

### PostgreSQL Schema (Time-Series Playback Analytics with BRIN Index)
```sql
CREATE TABLE video_playback_events (
    id UUID PRIMARY KEY,
    video_id UUID NOT NULL,
    user_id UUID,
    watched_seconds NUMERIC(6,2) NOT NULL,
    buffer_events INT NOT NULL DEFAULT 0,
    device_type VARCHAR(20) NOT NULL,
    ip_address INET,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- BRIN index is optimal for monotonically increasing timestamps
CREATE INDEX idx_playback_occurred_brin ON video_playback_events USING BRIN (occurred_at);
```

---

## 6. Implementation Milestones

```
Milestone 1: Direct-to-Storage Ingestion
├── Object storage integration (MinIO local / Cloudflare R2)
├── Presigned URL generation for secure, temporary upload access
├── Chunked file validation & content-type verification
└── MongoDB video record creation and state machine (`UPLOADING` → `UPLOADED`)

Milestone 2: Distributed Job Queue with Redis Streams
├── BullMQ queue configuration with concurrency bounds
├── Worker process isolation (independent Node.js process)
├── At-least-once job delivery semantics & ack handling
└── Dead Letter Queue (DLQ) for failed transcoding jobs

Milestone 3: FFmpeg Transcoding Engine & HLS Generation
├── FFmpeg execution via child process / worker threads
├── Resolution ladder encoding (1080p, 720p, 360p)
├── Segmentation into 6-second `.ts` chunks & `.m3u8` playlist generation
└── Thumbnail and poster frame extraction at key intervals

Milestone 4: Resumable Uploads (tus Protocol)
├── Integrating tus server protocol for resumable uploads
├── Upload state preservation across network interruptions
└── Checksum verification (SHA-256) upon upload completion

Milestone 5: Video Delivery, CDN Caching & Byte-Range Requests
├── HLS video delivery server with proper MIME types (`application/vnd.apple.mpegurl`)
├── HTTP byte-range request streaming (`206 Partial Content`)
├── CDN cache-control headers (caching `.ts` chunks permanently; short TTL on `.m3u8`)
└── Push notifications on transcode completion via ntfy

Milestone 6: Performance, Cleanup & High-Volume Analytics
├── PostgreSQL BRIN index performance benchmarking on millions of playback logs
├── Automated storage cleanup using `pg_cron` / S3 lifecycle policies
└── Load testing the transcode worker pool under burst queue conditions
```

---

## 7. Failure Modes & Adversarial Verification Labs

1. **The Worker Death Simulation:** Force-kill (`kill -9`) the FFmpeg worker process halfway through transcoding a 1 GB video. Verify that the job queue detects the heartbeat timeout, reassigns the job to another worker, and cleans up orphaned partial `.ts` files.
2. **The Event Loop Latency Test:** Ingest 50 concurrent video upload intents while actively transcoding 5 videos. Monitor Node.js event loop lag. Prove that the API gateway response time remains under 20ms because transcoding runs out-of-process.
3. **The Corrupted Media Poison Pill:** Upload an invalid MP4 file (random bytes disguised with an `.mp4` extension). Verify that FFmpeg fails gracefully, records the error in the DLQ, updates the video status to `FAILED`, and does not crash the worker.
