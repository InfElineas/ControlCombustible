/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Combustibles from './pages/Combustibles';
import Configuracion from './pages/Configuracion';
import Dashboard from './pages/Dashboard';
import Movimientos from './pages/Movimientos';
import Precios from './pages/Precios';
import Reportes from './pages/Reportes';
import Tarjetas from './pages/Tarjetas';
import Vehiculos from './pages/Vehiculos';
import __Layout from './Layout.jsx';


export const PAGES = {
    // BitacoraConsumo eliminado: la importación vive en "Configuracion"
    "Combustibles": Combustibles,
    "Configuracion": Configuracion,
    "Dashboard": Dashboard,
    "Movimientos": Movimientos,
    "Precios": Precios,
    "Reportes": Reportes,
    "Tarjetas": Tarjetas,
    "Vehiculos": Vehiculos,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
