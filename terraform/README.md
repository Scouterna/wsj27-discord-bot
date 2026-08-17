# WSJ27 Bot — Azure Container Apps (avvecklad)

> **Den här konfigurationen deployar ingenting längre.** Boten flyttades till
> Scouterna's delade AKS-kluster `webservices`, namespace `wsj27`, under
> AKS-migrationen. Kör den inte — se [../README.md](../README.md#deployment) för
> hur boten faktiskt driftsätts, och `k8s/` för manifesten.

Behålls som referens för det som fortfarande finns kvar i Azure, och för
historiken om någon undrar var resurserna tog vägen.

## Vad som inte längre finns

- **Container App** `app-discord-wsj27-bot-prod-sec` — borta, boten kör som
  Deployment `discord-wsj27-bot` på AKS
- **ACR `acrwsj27prodsec`** — **raderat.** Det fanns bara för att serva den här
  boten medan den låg på Container Apps. Images kommer nu från
  `ghcr.io/scouterna/wsj27-discord-bot`

Alla `az acr login`- och `az containerapp`-kommandon som stod här pekade på
resurser som inte existerar.

## Vad som finns kvar

- **Azure Files** — sharen som håller `claims.json`, i lagringskontot
  `stdiscordwsj27botprodsec`. Podden monterar den på `/persistent` via Secreten
  `wsj27-bot-storage`.

Kvarvarande Azure-resurser i prenumerationen dokumenteras i
`Scouterna/wsj27-infra` (`azure/`), som är det enda stället där Azure för WSJ27
hanteras som kod numera.

## Om det ska städas bort

Statefilen refererar resurser som är borttagna, så ett `terraform destroy`
härifrån är varken meningsfullt eller säkert — Azure Files-sharen med
produktionsdata ligger i samma state. Ta bort katalogen när någon har flyttat
sharen till `wsj27-infra` (`azure/`), inte innan.
