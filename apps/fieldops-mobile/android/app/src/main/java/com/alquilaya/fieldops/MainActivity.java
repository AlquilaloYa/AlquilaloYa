package com.alquilaya.fieldops;

import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaCapturePlugin.class);
        super.onCreate(savedInstanceState);
        // Required for the native WebView's cross-origin ERP API session cookies.
        CookieManager.getInstance().setAcceptThirdPartyCookies(getBridge().getWebView(), true);
    }
}
