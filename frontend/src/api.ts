import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const TOKEN_KEY = "auth_token";

async function authHeader() {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res: Response) {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || "حدث خطأ";
    throw new Error(typeof msg === "string" ? msg : "حدث خطأ");
  }
  return data;
}

export const api = {
  base: BASE,
  async get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: { ...(await authHeader()) } });
    return handle(res);
  },
  async post(path: string, body?: any) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handle(res);
  },
  async put(path: string, body?: any) {
    const res = await fetch(`${BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handle(res);
  },
  async del(path: string) {
    const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: { ...(await authHeader()) } });
    return handle(res);
  },
  fileUrl(path: string | null | undefined) {
    if (!path) return undefined;
    return `${BASE}/files/${path}`;
  },
};

// Upload a local file uri (from image picker) via multipart. Works on web + native.
export async function uploadFile(uri: string, name = "upload.jpg", type = "image/jpeg", isPublic = false) {
  const { Platform } = require("react-native");
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as any);
  }
  const path = isPublic ? "/upload-public" : "/upload";
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...(isPublic ? {} : await authHeader()) },
    body: form,
  });
  const data = await handle(res);
  return data.path as string;
}
