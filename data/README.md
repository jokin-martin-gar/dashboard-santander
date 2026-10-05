# data/

Coloque aquí el Excel de datos, preferiblemente como `BBDD.xlsx` (si no existe, se usa el primer
`.xlsx`/`.xls` por orden alfabético).

El Excel **no se versiona** (está en `.gitignore`) porque contiene datos de riesgo y el repositorio es
público. Sin él, la aplicación muestra un aviso y permite cargar un archivo manualmente, y el test de
reconciliación (`tests/reconciliation`) se omite.
