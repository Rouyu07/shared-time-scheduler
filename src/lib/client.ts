export async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/schedules${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "操作失敗");
  return data;
}
