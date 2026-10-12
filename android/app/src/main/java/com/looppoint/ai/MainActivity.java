package com.looppoint.ai;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Thin WebView shell around the bundled single-file app. Everything (UI, chat
 * history, keys, icons) lives in the asset page, so the APK is fully offline
 * apart from the AI provider calls themselves.
 */
public class MainActivity extends Activity {
    private static final String START_PAGE = "file:///android_asset/deepseek-mobile.html";
    private static final int REQUEST_SAVE = 4101;
    private static final int REQUEST_OPEN = 4102;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSave;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.setBackgroundColor(0xFFF7F9F7);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        // The page is a local asset: the file rules below are what let its
        // fetch() calls to the AI providers through without CORS rejections.
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || "file".equals(uri.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    // Nothing can open the link: keep the app on its own page.
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQUEST_OPEN);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        webView.addJavascriptInterface(new AppBridge(), "LoopPointApp");
        setContentView(webView);
        webView.loadUrl(START_PAGE);
    }

    /** Lets the page save a JSON backup through the system file picker. */
    private class AppBridge {
        @JavascriptInterface
        public boolean isApp() {
            return true;
        }

        @JavascriptInterface
        public boolean saveText(final String name, final String text) {
            pendingSave = text;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(intent, REQUEST_SAVE);
                    } catch (ActivityNotFoundException error) {
                        pendingSave = null;
                    }
                }
            });
            return true;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == REQUEST_OPEN) {
            Uri[] picked = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    picked = new Uri[count];
                    for (int index = 0; index < count; index++) {
                        picked[index] = data.getClipData().getItemAt(index).getUri();
                    }
                } else if (data.getData() != null) {
                    picked = new Uri[] { data.getData() };
                }
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(picked);
                fileCallback = null;
            }
            return;
        }
        if (request == REQUEST_SAVE) {
            if (result == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                writeText(data.getData(), pendingSave);
            }
            pendingSave = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    private void writeText(Uri target, final String text) {
        boolean saved = false;
        try (OutputStream stream = getContentResolver().openOutputStream(target, "wt")) {
            if (stream != null) {
                stream.write(text.getBytes(StandardCharsets.UTF_8));
                stream.flush();
                saved = true;
            }
        } catch (Exception ignored) {
            saved = false;
        }
        final String message = saved ? "备份已保存" : "保存失败，请换个位置再试";
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript(
                    "window.__loopPointNative&&window.__loopPointNative(" + quote(message) + ")", null);
            }
        });
    }

    private static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (char letter : value.toCharArray()) {
            if (letter == '"' || letter == '\\') out.append('\\').append(letter);
            else if (letter < 0x20) out.append(String.format("\\u%04x", (int) letter));
            else out.append(letter);
        }
        return out.append('"').toString();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("LoopPointApp");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
