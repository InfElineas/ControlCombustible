import React from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, List, User, Pencil, Trash2, FileText } from 'lucide-react';

export default function MovimientoAcciones({ movimiento, onLog, onDetalle, onVerDetalle, onEditar, onEliminar, canDelete, canWrite }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onVerDetalle(movimiento)} className="gap-2 cursor-pointer">
          <FileText className="w-3.5 h-3.5 text-slate-500" />
          Detalles del movimiento
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onLog(movimiento)} className="gap-2 cursor-pointer">
          <List className="w-3.5 h-3.5 text-slate-500" />
          Log del consumidor
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDetalle(movimiento)} className="gap-2 cursor-pointer">
          <User className="w-3.5 h-3.5 text-slate-500" />
          Detalles del consumidor
        </DropdownMenuItem>
        {canWrite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEditar(movimiento)} className="gap-2 cursor-pointer">
              <Pencil className="w-3.5 h-3.5 text-slate-500" />
              Editar movimiento
            </DropdownMenuItem>
          </>
        )}
        {canDelete && (
          <>
            {!canWrite && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => onEliminar(movimiento.id)}
              className="gap-2 cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar movimiento
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}