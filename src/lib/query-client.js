import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Necesario para la lectura sin conexión: con el valor por omisión de
			// 5 minutos, una consulta sin componentes que la observen se elimina de
			// la caché y no llega a guardarse en el dispositivo. Con 7 días
			// sobrevive al cierre de la aplicación. No afecta a cuándo se refresca
			// —eso lo decide staleTime—, solo a cuánto se conserva.
			gcTime: 1000 * 60 * 60 * 24 * 7,
		},
	},
});