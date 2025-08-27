import {
  extractErrorDetails,
  prismaToApi,
} from "../../utils/extractErrorDetails";

interface ResponseProps<T = any> {
  message?: string;
  data?: T;
}

export class ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: unknown;

  constructor({
    success,
    message = "Éxito",
    data,
    error,
  }: {
    success: boolean;
    message?: string;
    data?: T;
    error?: unknown;
  }) {
    this.success = success;
    this.message = message;

    if (data !== undefined) this.data = data;
    if (error !== undefined) this.error = error;
  }

  static success<T>(props: ResponseProps<T>): ApiResponse<T> {
    return new ApiResponse({ success: true, ...props });
  }

  static error({
    message,
    error = null,
  }: {
    message?: string;
    error?: unknown;
  }): ApiResponse<null> {
    // si no hay error concreto, respeta el message tal cual
    if (!error) {
      return new ApiResponse({
        success: false,
        message, // <- respeta lo que pasaste
        error: null,
      });
    }

    const mapped = prismaToApi(error);
    const formattedError =
      error instanceof Error ? extractErrorDetails(error) : error;

    // console.log(error, mapped);
    return new ApiResponse({
      success: false,
      message: message ?? mapped.userMessage ?? "Error interno del servidor",
      error: formattedError,
    });
  }
}
