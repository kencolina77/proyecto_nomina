# Nómina Clara

Aplicación React para consultar libros Excel de nómina. Los archivos se leen localmente en el navegador o en la aplicación de Windows; la aplicación no los envía a un servidor ni incorpora datos personales en la compilación.

## Desarrollo web

Requiere Node.js LTS.

```powershell
npm install
npm run dev
```

Para validar el proyecto:

```powershell
npm run lint
npm run build
```

## Aplicación de escritorio

Para abrir la versión de escritorio durante el desarrollo:

```powershell
npm run desktop:dev
```

Para compilar un instalador Windows x64:

```powershell
npm run dist:win
```

El instalador se genera en `release\NominaClara-Setup-1.0.0.exe`.

## Uso

Abre la aplicación y selecciona un archivo `.xlsx`. La hoja `NOMINA` se abre primero cuando está presente. Puedes cambiar de hoja, buscar en todos sus campos, filtrar por cargo y mostrar todas las columnas.

Usa el botón de edición de cada registro para modificar bonos, deducciones u otros campos. Los cambios se mantienen en memoria y se descargan en una nueva copia del libro con `Descargar Excel editado`; el archivo de entrada nunca se sobrescribe. También se pueden exportar las filas filtradas como CSV.

La sección **Cuentas por pagar** permite crear y editar facturas de proveedores, indicar montos en USD o VES, fechas de emisión/vencimiento, notas y estado de pago. Los registros se guardan en el almacenamiento local de la aplicación y se pueden exportar como CSV. Esta sección es independiente de la columna de deudas pendientes de nómina.

Los libros pueden contener información personal o bancaria. No publiques los archivos Excel ni una compilación que los incluya en un sitio público. La aplicación no empaqueta el Excel y el procesamiento ocurre en el dispositivo.
