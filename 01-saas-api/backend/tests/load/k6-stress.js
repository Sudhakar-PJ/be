/* eslint-disable no-undef */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// Custom Performance & Reliability Metrics
const serverErrors = new Rate("server_5xx_errors");
const rateLimitedCount = new Counter("rate_limited_429_total");
const tasksReadLatency = new Trend("tasks_read_latency_ms");
const tasksCreateLatency = new Trend("tasks_create_latency_ms");

export const options = {
  stages: [
    { duration: "5s", target: 30 }, // Warm-up: 30 concurrent users
    { duration: "15s", target: 150 }, // Peak Stress: 150 concurrent users
    { duration: "5s", target: 0 }, // Ramp-down
  ],

  thresholds: {
    // 95% of requests must complete under 150ms
    http_req_duration: ["p(95)<150", "p(99)<300"],
    // Real server 5xx crashes must be below 1%
    server_5xx_errors: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.API_URL || "http://localhost:4000";
const TENANT_ID = "01a1ba34-e891-7718-8343-b184b2263be2";

/**
 * 1. Setup Phase (Runs ONCE before virtual users launch).
 * Authenticates using the seeded benchmark user.
 */
export function setup() {
  const loginPayload = JSON.stringify({
    email: "loadtest@example.com",
    password: "Password123!",
  });

  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, loginPayload, {
    headers: { "Content-Type": "application/json" },
  });

  if (loginRes.status !== 200) {
    throw new Error(`Failed to log in benchmark user (${loginRes.status}): ${loginRes.body}`);
  }

  const authData = JSON.parse(loginRes.body);
  const token = authData.data.accessToken;

  // Retrieve existing project for task creation benchmarks
  const projectsRes = http.get(`${BASE_URL}/api/v1/projects`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Tenant-ID": TENANT_ID,
    },
  });

  const projectsData = JSON.parse(projectsRes.body);
  const projectId = projectsData.data[0]?.id;

  return {
    token,
    tenantId: TENANT_ID,
    projectId,
  };
}

/**
 * 2. Virtual User Execution Loop (Simulates realistic concurrent SaaS traffic).
 */
export default function (data) {
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.token}`,
    "X-Tenant-ID": data.tenantId,
  };

  // --- TRAFFIC PATTERN 1: 40% Keyset Cursor Pagination & Search ---
  const listTasksRes = http.get(
    `${BASE_URL}/api/v1/tasks?limit=10${data.projectId ? `&projectId=${data.projectId}` : ""}`,
    { headers: authHeaders },
  );
  tasksReadLatency.add(listTasksRes.timings.duration);
  serverErrors.add(listTasksRes.status >= 500);
  check(listTasksRes, {
    "tasks list is 200": (r) => r.status === 200,
  });

  // --- TRAFFIC PATTERN 2: 25% Task Creation (OCC, DB Insert, Async Job Enqueue) ---
  if (data.projectId) {
    const createTaskPayload = JSON.stringify({
      projectId: data.projectId,
      title: `Load Task ${Math.random().toString(36).substring(7)}`,
      description: "Benchmark task payload exercising database and BullMQ queue",
      priority: "HIGH",
    });

    const createTaskRes = http.post(`${BASE_URL}/api/v1/tasks`, createTaskPayload, {
      headers: authHeaders,
    });
    tasksCreateLatency.add(createTaskRes.timings.duration);
    serverErrors.add(createTaskRes.status >= 500);
    check(createTaskRes, {
      "task created is 201": (r) => r.status === 201,
    });
  }

  // --- TRAFFIC PATTERN 3: 15% Projects Query ---
  const projectsRes = http.get(`${BASE_URL}/api/v1/projects`, {
    headers: authHeaders,
  });
  serverErrors.add(projectsRes.status >= 500);
  check(projectsRes, {
    "projects list is 200": (r) => r.status === 200,
  });

  // --- TRAFFIC PATTERN 4: 10% Infrastructure Probes & Prometheus Metrics ---
  const liveRes = http.get(`${BASE_URL}/health/live`);
  const readyRes = http.get(`${BASE_URL}/health/ready`);
  const metricsRes = http.get(`${BASE_URL}/metrics`);
  serverErrors.add(liveRes.status >= 500 || readyRes.status >= 500 || metricsRes.status >= 500);

  check(liveRes, { "live probe 200": (r) => r.status === 200 });
  check(readyRes, { "ready probe 200": (r) => r.status === 200 });
  check(metricsRes, { "metrics 200": (r) => r.status === 200 });

  // --- TRAFFIC PATTERN 5: 10% Public Auth & Rate Limiter Saturation ---
  const publicAuthRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({
      email: "attacker@example.com",
      password: "wrong_password",
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  serverErrors.add(publicAuthRes.status >= 500);

  if (publicAuthRes.status === 429) {
    rateLimitedCount.add(1);
    check(publicAuthRes, { "rate limited 429": (r) => r.status === 429 });
  } else {
    check(publicAuthRes, { "auth rejected 401": (r) => r.status === 401 });
  }

  // Realistic human pacing (50ms)
  sleep(0.05);
}
