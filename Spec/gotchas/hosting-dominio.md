# Gotchas — Hosting + dominio

> Canon de gotchas de Firebase Hosting custom domains / DNS / SSL. Indexado en `Spec/ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".

## Borrar el parking es prerequisito del SSL del custom domain

Firebase **NO provisiona el certificado SSL** de un custom domain mientras existan registros `A`/`CNAME`/`AAAA` del host apuntando a **otros proveedores**. En la migración del apex `getsecondmind.co` (SPEC-63 F2), el **parking de Namecheap** (`A @ → 192.64.119.70` + `CNAME www → parkingpage.namecheap.com`) **bloqueaba la emisión del certificado** y causaba un **error 522** en el challenge ACME HTTP: Firebase leía el apex parkeado/proxiado y no podía servir el desafío de validación.

**Implicación operativa — invertir el orden ingenuo:** borrar el parking es **prerequisito** de la emisión del SSL, **no** un paso posterior. El "paso 3" (agregar los `A` records que da Firebase → `199.36.158.100`) hay que **adelantarlo** para destrabar el "paso 2" (SSL): primero se reemplaza el parking por los `A` de Firebase (en **gris / Solo DNS**), y recién con el host apuntando a Firebase el cert se emite. Confirmado contra la doc oficial de Firebase Hosting.

**Corolario — DNS quirúrgico:** los registros del parking (`A`/`CNAME`) son **ortogonales** a los `MX`/`SPF`/`DKIM` del correo — se borran los del parking sin tocar el email-routing. Estado final verificado en `getsecondmind.co`: parking removido; `A @` + `A www → 199.36.158.100` (gris); `www → apex` **301**; SSL en ambos; **`MX route1/2/3.mx.cloudflare.net` (pref 66/25/4) + SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` idénticos al baseline, DKIM no tocado**.
