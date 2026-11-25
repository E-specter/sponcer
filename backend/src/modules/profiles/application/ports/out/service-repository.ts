import type { Service, ServiceInput } from '@sponcer/contracts';

export interface ServiceRepository {
  list(profileId: string): Promise<Service[]>;
  /** Busca un servicio por id en cualquier catálogo. */
  findById(serviceId: string): Promise<{ service: Service; profileId: string } | null>;
  /** Reemplaza todo el catálogo del perfil y devuelve el resultado con ids. */
  replace(profileId: string, services: ServiceInput[]): Promise<Service[]>;
}
