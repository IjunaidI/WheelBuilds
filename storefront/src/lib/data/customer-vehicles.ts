"use server"

import { sdk } from "@lib/config"
import type { Vehicle, NewVehicle } from "@lib/garage/types"
import { getAuthHeaders } from "./cookies"

type Wire = Partial<Vehicle> & { client_id: string; modificationSlug?: string }

// These are Server Actions (not client-side fetches). The customer-vehicle
// routes authenticate via req.auth_context.actor_id, which Medusa's store-auth
// middleware populates from the `Authorization: Bearer <jwt>` header — NOT from
// the httpOnly `_medusa_jwt` cookie. A browser fetch (credentials:"include")
// can only send the cookie, which the backend ignores → 401. Running these on
// the server lets getAuthHeaders() read the httpOnly cookie and send the Bearer
// header (the same path login/cart already use), so authed garage writes work.

export const listVehicles = async () =>
  sdk.client.fetch<{ vehicles: any[] }>("/store/customer/vehicles", {
    method: "GET",
    headers: await getAuthHeaders(),
  })

export const createVehicle = async (v: Wire) =>
  sdk.client.fetch<{ vehicle: any }>("/store/customer/vehicles", {
    method: "POST",
    body: v,
    headers: await getAuthHeaders(),
  })

export const updateVehicle = async (id: string, patch: Partial<Wire>) =>
  sdk.client.fetch<{ vehicle: any }>(`/store/customer/vehicles/${id}`, {
    method: "POST",
    body: patch,
    headers: await getAuthHeaders(),
  })

export const deleteVehicle = async (id: string) =>
  sdk.client.fetch<{ deleted: boolean }>(`/store/customer/vehicles/${id}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  })

export const activateVehicle = async (id: string) =>
  sdk.client.fetch<{ active: boolean }>(`/store/customer/vehicles/${id}/activate`, {
    method: "POST",
    headers: await getAuthHeaders(),
  })

export const mergeVehicles = async (vehicles: Wire[]) =>
  sdk.client.fetch<{ vehicles: any[] }>("/store/customer/vehicles/merge", {
    method: "POST",
    body: { vehicles },
    headers: await getAuthHeaders(),
  })
