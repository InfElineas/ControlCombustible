import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

const EXAMPLE_JSON = `[
  {
    "Tarjeta": "9240069992278321",
    "Fecha": "03/01/26",
    "Tipo Combustible": "Diesel",
    "Precio": 1.3,
    "Carga L": 0,
    "Carga $": null,
    "Compra L": 66,
    "Compra $": 85.80,
    "Chapa": "W004399",
    "Accion": "COMPRA"
  },
  {
    "Tarjeta": "9240069992278321",
    "Fecha": "04/01/26",
    "Tipo Combustible": "Carga",
    "Precio": 0,
    "Carga L": null,
    "Carga $": 1500,
    "Compra L": null,
    "Compra $": null,
    "Chapa": null,
    "Accion": "RECARGA"
  }
]`;

const CSV_EXAMPLE = `Tarjeta,Fecha,Tipo Combustible,Precio,Carga L,Carga $,Compra L,Compra $,Chapa,Accion
9240069992278321,03/01/26,Diesel,1.3,0,,66,85.80,W004399,COMPRA
9240069992278321,04/01/26,Carga,0,,1500,,,, RECARGA`;

export default function ImportGuide() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-500" />
            Guía de formato para importación
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5 pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Columnas requeridas</h3>
              <div className="space-y-1.5">
                {[
                  { col: 'Tarjeta', desc: 'Número de tarjeta (debe estar registrada)' },
                  { col: 'Fecha', desc: 'Formato DD/MM/YY o DD/MM/YYYY' },
                  { col: 'Tipo Combustible', desc: 'Diesel, Gasolina Especial, Gasolina Regular, Carga' },
                  { col: 'Accion', desc: 'COMPRA o RECARGA' },
                  { col: 'Compra $', desc: 'Monto de la compra (solo COMPRA)' },
                  { col: 'Carga $', desc: 'Monto de la recarga (solo RECARGA)' },
                  { col: 'Chapa', desc: 'Matrícula del vehículo (solo COMPRA)' },
                  { col: 'Compra L', desc: 'Litros comprados (solo COMPRA)' },
                  { col: 'Precio', desc: 'Precio por litro (solo COMPRA)' },
                ].map(({ col, desc }) => (
                  <div key={col} className="flex gap-2 text-xs">
                    <code className="shrink-0 px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono">{col}</code>
                    <span className="text-slate-500">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Ejemplo JSON</h3>
                <pre className="bg-slate-900 text-emerald-400 rounded-xl p-3 text-[10px] overflow-x-auto leading-relaxed">
                  {EXAMPLE_JSON}
                </pre>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Ejemplo CSV</h3>
                <pre className="bg-slate-900 text-sky-400 rounded-xl p-3 text-[10px] overflow-x-auto leading-relaxed">
                  {CSV_EXAMPLE}
                </pre>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
