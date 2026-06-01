import { sdk } from "@lib/config"
import type { Vehicle, NewVehicle } from "@lib/garage/types"

type Wire = Partial<Vehicle> & { client_id: string; modificationSlug?: string }

export const listVehicles = () => sdk.client.fetch<{ vehicles: any[] }>("/store/customer/vehicles", { method: "GET", credentials: "include" })
export const createVehicle = (v: Wire) => sdk.client.fetch<{ vehicle: any }>("/store/customer/vehicles", { method: "POST", body: v, credentials: "include" })
export const updateVehicle = (id: string, patch: Partial<Wire>) => sdk.client.fetch<{ vehicle: any }>(`/store/customer/vehicles/${id}`, { method: "POST", body: patch, credentials: "include" })
export const deleteVehicle = (id: string) => sdk.client.fetch<{ deleted: boolean }>(`/store/customer/vehicles/${id}`, { method: "DELETE", credentials: "include" })
export const activateVehicle = (id: string) => sdk.client.fetch<{ active: boolean }>(`/store/customer/vehicles/${id}/activate`, { method: "POST", credentials: "include" })
