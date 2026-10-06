import { NextResponse } from "next/server";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

