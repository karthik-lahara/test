import { toast as sonner } from "sonner";

interface ToastOptions {
  description?: string;
  id?: string;
}

export const toast = {
  success: (message: string, options?: ToastOptions) => sonner.success(message, options),
  error: (message: string, options?: ToastOptions) => sonner.error(message, options),
  info: (message: string, options?: ToastOptions) => sonner.info(message, options),
  warning: (message: string, options?: ToastOptions) => sonner.warning(message, options),
  dismiss: (id?: string) => sonner.dismiss(id),
};
