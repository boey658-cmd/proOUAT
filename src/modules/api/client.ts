/**
 * Client HTTP partagé pour les appels API métier.
 * Une responsabilité : instance axios avec baseURL, timeout et gestion d'erreurs centralisée.
 */

import axios, { type AxiosInstance } from 'axios';
import { getApiBaseUrl, getRequestTimeoutMs } from '../../config/index.js';

let client: AxiosInstance | null = null;

/**
 * Retourne le client axios configuré (baseURL, timeout).
 * Créé à la première utilisation.
 */
export function getApiClient(): AxiosInstance {
  if (client) return client;
  const baseURL = getApiBaseUrl();
  const timeout = getRequestTimeoutMs();
  client = axios.create({
    baseURL,
    timeout,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: (status) => status >= 200 && status < 300,
  });
  return client;
}

/**
 * Réinitialise le client (utile pour tests ou changement de config).
 */
export function resetApiClient(): void {
  client = null;
}
