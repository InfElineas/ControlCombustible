{
  "name": "Tarjeta",
  "type": "object",
  "properties": {
    "id_tarjeta": {
      "type": "string",
      "description": "N\u00famero \u00fanico de la tarjeta"
    },
    "alias": {
      "type": "string",
      "description": "Nombre descriptivo opcional"
    },
    "moneda": {
      "type": "string",
      "enum": [
        "USD",
        "CUP",
        "EUR",
        "MLC"
      ],
      "default": "CUP",
      "description": "Moneda de la tarjeta"
    },
    "saldo_inicial": {
      "type": "number",
      "default": 0,
      "description": "Saldo inicial al registrar la tarjeta"
    },
    "umbral_alerta": {
      "type": "number",
      "description": "Saldo m\u00ednimo antes de alertar"
    },
    "activa": {
      "type": "boolean",
      "default": true,
      "description": "Si la tarjeta est\u00e1 activa"
    }
  },
  "required": [
    "id_tarjeta",
    "moneda",
    "saldo_inicial"
  ]
}