package com.alquilaya.fieldops;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

@CapacitorPlugin(name = "MediaCapture")
public class MediaCapturePlugin extends Plugin {
    @PluginMethod
    public void capture(PluginCall call) {
        String kind = call.getString("kind");
        boolean isVideo = "video".equals(kind);
        if (!isVideo && !"photo".equals(kind)) {
            call.reject("Tipo de captura no válido.");
            return;
        }

        Intent intent = new Intent(
            isVideo ? MediaStore.ACTION_VIDEO_CAPTURE : MediaStore.ACTION_IMAGE_CAPTURE
        );
        PackageManager packageManager = getContext().getPackageManager();
        if (intent.resolveActivity(packageManager) == null) {
            call.reject("No se encontró una aplicación de cámara compatible.");
            return;
        }

        File captureDirectory = new File(getContext().getCacheDir(), "media-captures");
        if (!captureDirectory.exists() && !captureDirectory.mkdirs()) {
            call.reject("No se pudo preparar el almacenamiento temporal de la cámara.");
            return;
        }

        File outputFile;
        try {
            outputFile = File.createTempFile(
                isVideo ? "video-" : "photo-",
                isVideo ? ".mp4" : ".jpg",
                captureDirectory
            );
        } catch (IOException error) {
            call.reject("No se pudo crear el archivo para la captura.", error);
            return;
        }

        Uri outputUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            outputFile
        );
        intent.putExtra(MediaStore.EXTRA_OUTPUT, outputUri);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("camera-capture", outputUri));
        if (isVideo) {
            intent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 60);
            intent.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 0);
        }

        call.getData().put("outputPath", outputFile.getAbsolutePath());
        call.getData().put("kind", kind);
        startActivityForResult(call, intent, "captureResult");
    }

    @ActivityCallback
    private void captureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        String path = call.getString("outputPath");
        File outputFile = path == null ? null : new File(path);
        if (result.getResultCode() != Activity.RESULT_OK) {
            if (outputFile != null) outputFile.delete();
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }

        if (outputFile == null) {
            call.reject("No se encontró el archivo de la captura.");
            return;
        }

        if (outputFile.length() == 0 && result.getData() != null && result.getData().getData() != null) {
            try {
                copyUriToFile(result.getData().getData(), outputFile);
            } catch (IOException error) {
                outputFile.delete();
                call.reject("No se pudo guardar el archivo capturado.", error);
                return;
            }
        }

        if (!outputFile.isFile() || outputFile.length() == 0) {
            outputFile.delete();
            call.reject("La aplicación de cámara no devolvió ningún archivo.");
            return;
        }

        boolean isVideo = "video".equals(call.getString("kind"));
        JSObject response = new JSObject();
        response.put("cancelled", false);
        response.put("path", outputFile.getAbsolutePath());
        response.put("name", outputFile.getName());
        response.put("mimeType", isVideo ? "video/mp4" : "image/jpeg");
        call.resolve(response);
    }

    @PluginMethod
    public void removeCaptureFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Falta la ruta del archivo temporal.");
            return;
        }

        try {
            File captureDirectory = new File(getContext().getCacheDir(), "media-captures").getCanonicalFile();
            File target = new File(path).getCanonicalFile();
            if (!target.getPath().startsWith(captureDirectory.getPath() + File.separator)) {
                call.reject("La ruta no pertenece al almacenamiento temporal de capturas.");
                return;
            }
            if (target.exists() && !target.delete()) {
                call.reject("No se pudo eliminar el archivo temporal de captura.");
                return;
            }
            call.resolve();
        } catch (IOException error) {
            call.reject("No se pudo verificar el archivo temporal de captura.", error);
        }
    }

    private void copyUriToFile(Uri uri, File outputFile) throws IOException {
        try (
            InputStream input = getContext().getContentResolver().openInputStream(uri);
            FileOutputStream output = new FileOutputStream(outputFile)
        ) {
            if (input == null) throw new IOException("No se pudo abrir el archivo de la cámara.");
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = input.read(buffer)) != -1) {
                output.write(buffer, 0, bytesRead);
            }
        }
    }
}
