package com.secondmind.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    // F61 — Purga del HTTP cache del WebView en update de APK.
    // Capacitor sirve los assets locales (WebViewLocalServer) con Cache-Control: no-cache
    // (permite ALMACENAR, solo pide revalidar) y nunca llama setCacheMode (queda LOAD_DEFAULT).
    // El WebView guarda index.html (nombre estable entre releases) en su HTTP disk cache y lo
    // reusa tras el update → carga los chunks JS hasheados viejos → bundle viejo. Vive en la
    // partición "Caché", de ahí que "Eliminar caché" lo curaba a mano. Replicamos el patrón
    // purge-on-version-bump de Tauri (src-tauri/src/version_check.rs): gate por versionCode vs
    // una marca persistida FUERA del WebView (SharedPreferences propio, no app_webview/).
    private static final String CACHE_PURGE_TAG = "SecondMindCachePurge";
    private static final String NATIVE_PREFS = "secondmind_native";
    private static final String KEY_LAST_PURGED_VERSION_CODE = "lastPurgedVersionCode";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // En este punto getBridge() ya es no-null y la navegación inicial (loadUrl(appUrl)
        // síncrono dentro de BridgeActivity.load()) ya se disparó.
        purgeWebViewCacheOnVersionBump();
    }

    // Purga el HTTP cache del WebView solo cuando el versionCode del build supera el último
    // purgado. SharedPreferences propio (no la key LAST_BINARY_VERSION_NAME de Capacitor, que
    // invalida CAP_SERVER_PATH de live-updates, no el HTTP cache). La marca se escribe SOLO al
    // purgar y con .commit() (síncrono) para no dejar ventana de carrera si el proceso muere.
    private void purgeWebViewCacheOnVersionBump() {
        int currentVersionCode = BuildConfig.VERSION_CODE;
        SharedPreferences prefs = getSharedPreferences(NATIVE_PREFS, MODE_PRIVATE);
        int storedVersionCode = prefs.getInt(KEY_LAST_PURGED_VERSION_CODE, 0);

        Log.i(CACHE_PURGE_TAG, "gate: current=" + currentVersionCode + " stored=" + storedVersionCode
                + " debug=" + BuildConfig.DEBUG);

        // Gate monotónico (>): no purga en downgrade/rollback (ese cache ya se invalidó al subir).
        if (currentVersionCode <= storedVersionCode) {
            Log.i(CACHE_PURGE_TAG, "noop: no version bump, skipping cache purge");
            return;
        }

        // Guard defensivo: tras super.onCreate() no debería ocurrir, pero si el WebView no está
        // disponible NO marcamos la versión → se reintenta en el próximo arranque.
        if (getBridge() == null || getBridge().getWebView() == null) {
            Log.w(CACHE_PURGE_TAG, "bridge/webview null, deferring purge to next launch");
            return;
        }

        WebView webView = getBridge().getWebView();
        // clearCache(true) borra el HTTP cache (disco + RAM). NO toca IndexedDB/localStorage/DOM
        // storage/Firestore persistence (eso vive en "Datos", se borra con WebStorage.deleteAllData).
        webView.clearCache(true);
        // Reload posteado al message queue del WebView → corre DESPUÉS del loadUrl(appUrl) inicial
        // síncrono, ya con el cache purgado. WebView.reload() re-valida la URL actual; no recrea la
        // Activity, así que no re-dispara onCreate (sin loop infinito).
        webView.post(webView::reload);

        prefs.edit().putInt(KEY_LAST_PURGED_VERSION_CODE, currentVersionCode).commit();
        Log.w(CACHE_PURGE_TAG, "purged: clearCache(true) + reload, marked versionCode="
                + currentVersionCode);
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin login handle is null");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
