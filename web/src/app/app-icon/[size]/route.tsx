import { ImageResponse } from "next/og";
import { BrandIcon } from "@/components/shared/brand-icon";

/** Ícones do app instalável (manifest): /app-icon/192, /app-icon/512 e ?maskable=1. */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const requested = Number((await params).size);
  const size = requested === 512 ? 512 : 192;
  const maskable = new URL(request.url).searchParams.get("maskable") === "1";
  return new ImageResponse(<BrandIcon size={size} maskable={maskable} />, { width: size, height: size });
}
