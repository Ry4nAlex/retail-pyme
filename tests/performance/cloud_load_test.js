import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL =
  __ENV.BASE_URL ||
  'https://backend-production-090e.up.railway.app';

const TOKEN = __ENV.TOKEN;

const VUS = Number(__ENV.VUS || 1);
const DURATION = __ENV.DURATION || '15s';
const RUN_LABEL = __ENV.RUN_LABEL || 'diagnostic';

// Latencia únicamente de solicitudes HTTP 200.
const successfulRequestDuration =
  new Trend('successful_request_duration', true);

// Conteo de códigos de respuesta.
const status200 = new Counter('status_200');
const status400 = new Counter('status_400');
const status401 = new Counter('status_401');
const status403 = new Counter('status_403');
const status429 = new Counter('status_429');

const status500 = new Counter('status_500');
const status502 = new Counter('status_502');
const status503 = new Counter('status_503');
const status504 = new Counter('status_504');

const networkErrors = new Counter('network_errors');
const otherStatus = new Counter('status_other');

export const options = {
  vus: VUS,
  duration: DURATION,

  summaryTrendStats: [
    'avg',
    'min',
    'p(50)',
    'p(95)',
    'p(99)',
    'max',
  ],

  discardResponseBodies: true,
};

export function setup() {
  if (!TOKEN) {
    throw new Error(
      'No se encontró TOKEN. Configura la variable de entorno TOKEN.'
    );
  }
}

export default function () {
  const response = http.get(
    `${BASE_URL}/api/v1/ml/analyses`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json',
      },

      tags: {
        endpoint: 'ml_analyses',
      },
    }
  );

  if (response.status === 200) {
    status200.add(1);

    successfulRequestDuration.add(
      response.timings.duration
    );
  } else if (response.status === 0) {
    networkErrors.add(1);
  } else if (response.status === 400) {
    status400.add(1);
  } else if (response.status === 401) {
    status401.add(1);
  } else if (response.status === 403) {
    status403.add(1);
  } else if (response.status === 429) {
    status429.add(1);
  } else if (response.status === 500) {
    status500.add(1);
  } else if (response.status === 502) {
    status502.add(1);
  } else if (response.status === 503) {
    status503.add(1);
  } else if (response.status === 504) {
    status504.add(1);
  } else {
    otherStatus.add(1);
  }

  check(response, {
    'status 200': (r) => r.status === 200,
  });
}

function counter(data, metric) {
  return data.metrics[metric]?.values?.count ?? 0;
}

export function handleSummary(data) {
  // IMPORTANTE:
  // Estos percentiles corresponden únicamente a respuestas HTTP 200.
  const duration =
    data.metrics.successful_request_duration?.values || {};

  const failed =
    data.metrics.http_req_failed?.values || {};

  const requests =
    data.metrics.http_reqs?.values || {};

  const statusCounts = {
    200: counter(data, 'status_200'),
    400: counter(data, 'status_400'),
    401: counter(data, 'status_401'),
    403: counter(data, 'status_403'),
    429: counter(data, 'status_429'),
    500: counter(data, 'status_500'),
    502: counter(data, 'status_502'),
    503: counter(data, 'status_503'),
    504: counter(data, 'status_504'),
    network_errors: counter(data, 'network_errors'),
    other: counter(data, 'status_other'),
  };

  const report = {
    test:
      'RetailPyme - tiempo de respuesta cliente-servidor',

    endpoint:
      '/api/v1/ml/analyses',

    concurrent_users: VUS,
    duration: DURATION,

    successful_response_time_ms: {
      average: duration.avg ?? null,
      minimum: duration.min ?? null,
      p50: duration['p(50)'] ?? null,
      p95: duration['p(95)'] ?? null,
      p99: duration['p(99)'] ?? null,
      maximum: duration.max ?? null,
    },

    throughput_requests_per_second:
      requests.rate ?? null,

    total_requests:
      requests.count ?? null,

    error_rate_pct:
      failed.rate != null
        ? failed.rate * 100
        : null,

    status_counts:
      statusCounts,
  };

  const f = (v) =>
    v != null ? Number(v).toFixed(2) : '-';

  return {
    stdout:
      '\n' +
      '========== RETAILPYME CLOUD BENCHMARK ==========\n' +
      `Usuarios concurrentes: ${VUS}\n` +
      `Duración: ${DURATION}\n\n` +

      '--- Respuestas exitosas ---\n' +
      `p50: ${f(report.successful_response_time_ms.p50)} ms\n` +
      `p95: ${f(report.successful_response_time_ms.p95)} ms\n` +
      `p99: ${f(report.successful_response_time_ms.p99)} ms\n\n` +

      '--- Carga ---\n' +
      `Throughput: ${f(report.throughput_requests_per_second)} req/s\n` +
      `Error: ${f(report.error_rate_pct)} %\n` +
      `Requests: ${report.total_requests ?? '-'}\n\n` +

      '--- Códigos HTTP ---\n' +
      `200: ${statusCounts[200]}\n` +
      `400: ${statusCounts[400]}\n` +
      `401: ${statusCounts[401]}\n` +
      `403: ${statusCounts[403]}\n` +
      `429: ${statusCounts[429]}\n` +
      `500: ${statusCounts[500]}\n` +
      `502: ${statusCounts[502]}\n` +
      `503: ${statusCounts[503]}\n` +
      `504: ${statusCounts[504]}\n` +
      `Errores de red: ${statusCounts.network_errors}\n` +
      `Otros: ${statusCounts.other}\n` +
      '================================================\n\n',

    [`tests/performance/results/${RUN_LABEL}_vus_${VUS}.json`]:
      JSON.stringify(report, null, 2),
  };
}