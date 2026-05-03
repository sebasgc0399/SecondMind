// Geometría matched con el system splash de Android 12+ (Theme.SplashScreen
// + windowSplashScreenAnimatedIcon): cerebro a 174px, centrado exacto en
// (50%, 50%). Tamaño calibrado empíricamente en device — el cálculo teórico
// canvas 288dp × 0.6 (padding del adaptive icon) ≈ 114dp underestima en
// Samsung porque el SplashScreen API no aplica el masking circular cuando
// no se especifica windowSplashScreenIconBackgroundColor. Texto absolute
// debajo sin alterar la posición del cerebro para que la transición
// system → React no salte.
export default function AppBootSplash() {
  return (
    <div className="relative h-screen w-screen bg-background">
      <img
        src="/favicon.svg"
        alt=""
        className="absolute left-1/2 top-1/2 h-[174px] w-[174px] -translate-x-1/2 -translate-y-1/2"
      />
      <h1 className="absolute left-1/2 top-[calc(50%+7rem)] -translate-x-1/2 text-3xl font-bold tracking-tight text-foreground">
        SecondMind
      </h1>
    </div>
  );
}
