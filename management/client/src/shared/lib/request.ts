import type { AxiosRequestConfig } from "axios";

import type { ApiResponse } from "@/shared/types/api";

import { axiosInstance } from "./apiClient";

export const request = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await axiosInstance.get<ApiResponse<T>>(url, config);
    return response.data.data;
  },

  async post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await axiosInstance.post<ApiResponse<T>>(url, body, config);
    return response.data.data;
  },

  async put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await axiosInstance.put<ApiResponse<T>>(url, body, config);
    return response.data.data;
  },

  async patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await axiosInstance.patch<ApiResponse<T>>(url, body, config);
    return response.data.data;
  },

  async delete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await axiosInstance.delete<ApiResponse<T>>(url, config);
    return response.data.data;
  },
};
