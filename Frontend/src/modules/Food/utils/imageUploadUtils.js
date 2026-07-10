import { toast } from "sonner"

const openTransientImageInput = ({
  onSelectFile,
  accept = "image/*",
  capture = undefined,
}) => {
  if (typeof document === "undefined") {
    throw new Error("Document is not available")
  }

  const input = document.createElement("input")
  input.type = "file"
  input.accept = accept
  input.multiple = false
  if (capture) {
    input.setAttribute("capture", capture)
  }

  input.style.position = "fixed"
  input.style.left = "-9999px"
  input.style.width = "1px"
  input.style.height = "1px"
  input.style.opacity = "0"
  input.style.pointerEvents = "none"

  const cleanup = () => {
    input.onchange = null
    input.oncancel = null
    if (input.parentNode) {
      input.parentNode.removeChild(input)
    }
  }

  input.onchange = (event) => {
    const file = event?.target?.files?.[0] || null
    if (file) onSelectFile(file)
    cleanup()
  }

  input.oncancel = cleanup
  document.body.appendChild(input)

  if (typeof input.showPicker === "function") {
    try {
      input.showPicker()
      return
    } catch {
      // Fall back to the standard click-based picker below.
    }
  }

  input.click()
}

/**
 * Utility to convert base64 image data from Flutter bridge into a File object
 */
export const convertBase64ToFile = (
  base64Value,
  mimeType = "image/jpeg",
  fileNamePrefix = "upload",
  originalFileName = "",
) => {
  if (!base64Value || typeof base64Value !== "string") {
    throw new Error("Invalid base64 image data")
  }

  let pureBase64 = base64Value
  if (base64Value.includes(",")) {
    pureBase64 = base64Value.split(",")[1]
  }

  try {
    const byteCharacters = atob(pureBase64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i += 1) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)
    const normalizedFileName = String(originalFileName || "").trim()
    const extension = normalizedFileName.includes(".")
      ? normalizedFileName.split(".").pop()
      : mimeType.includes("png")
        ? "png"
        : mimeType.includes("webp")
          ? "webp"
          : "jpg"
    const blob = new Blob([byteArray], { type: mimeType })
    const fileName = normalizedFileName || `${fileNamePrefix}-${Date.now()}.${extension}`
    return new File([blob], fileName, { type: mimeType })
  } catch (error) {
    console.error("Base64 conversion failed:", error)
    throw new Error("Failed to process image data")
  }
}

const isSuccessfulFlutterImageResult = (result) =>
  result?.success === true ||
  Boolean(result?.base64 || result?.base64String || result?.data?.base64 || result?.file)

const fileFromFlutterImageResult = (result, fileNamePrefix) => {
  const base64Value = result?.base64 || result?.base64String || result?.data?.base64
  const mimeType = result?.mimeType || result?.type || result?.data?.mimeType || "image/jpeg"
  const originalFileName = result?.fileName || result?.name || result?.data?.fileName || ""

  if (base64Value) {
    return convertBase64ToFile(base64Value, mimeType, fileNamePrefix, originalFileName)
  }

  if (result?.file instanceof File) {
    return result.file
  }

  if (result?.file instanceof Blob) {
    const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg"
    return new File([result.file], `${fileNamePrefix}-${Date.now()}.${extension}`, { type: mimeType })
  }

  return null
}

const openBrowserGalleryFallback = (onSelectFile, fallbackInputRef = null) => {
  if (fallbackInputRef?.current) {
    fallbackInputRef.current.click()
    return
  }

  openTransientImageInput({
    onSelectFile,
    accept: "image/*",
  })
}

/**
 * Standard browser camera fallback
 */
export const openBrowserCameraFallback = (onSelectFile, fallbackInputRef = null) => {
  if (!onSelectFile || typeof onSelectFile !== "function") {
    console.warn("openBrowserCameraFallback: onSelectFile callback not provided")
    return
  }

  try {
    if (fallbackInputRef?.current) {
      fallbackInputRef.current.click()
      return
    }

    openTransientImageInput({
      onSelectFile,
      accept: "image/*",
      capture: "environment",
    })
  } catch (error) {
    console.error("Browser camera fallback failed:", error)
    if (error?.message && !error.message.includes("canceled") && !error.message.includes("cancelled")) {
      toast.error("Could not open camera")
    }
  }
}

/**
 * Check if the Flutter InAppWebView bridge is available
 */
export const isFlutterBridgeAvailable = () => {
  return (
    typeof window !== "undefined" &&
    window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === "function"
  )
}

const invokeFlutterImageHandler = async ({
  handlerName,
  onSelectFile,
  fileNamePrefix,
  quality = 0.8,
  onCancel,
}) => {
  const handlerArgs =
    handlerName === "openCamera"
      ? {
          source: "camera",
          accept: "image/*",
          multiple: false,
          quality,
        }
      : undefined

  const result = await window.flutter_inappwebview.callHandler(handlerName, handlerArgs)

  if (!isSuccessfulFlutterImageResult(result)) {
    if (typeof onCancel === "function") {
      onCancel()
    }
    return false
  }

  const selectedFile = fileFromFlutterImageResult(result, fileNamePrefix)
  if (!selectedFile || !String(selectedFile.type || "").startsWith("image/")) {
    toast.error(handlerName === "openCamera" ? "Failed to capture image" : "Failed to select image")
    return false
  }

  onSelectFile(selectedFile)
  return true
}

/**
 * Unified image picker for Flutter WebView and standard browsers.
 */
export const handleImageUpload = async ({
  source = "gallery",
  onSelectFile,
  fallbackInputRef = null,
  fileNamePrefix = "upload",
  quality = 0.8,
  onCancel,
}) => {
  if (!onSelectFile || typeof onSelectFile !== "function") {
    console.warn("handleImageUpload: onSelectFile callback not provided")
    return
  }

  const isCamera = source === "camera"

  if (isFlutterBridgeAvailable()) {
    const handlerName = isCamera ? "openCamera" : "openGallery"

    try {
      await invokeFlutterImageHandler({
        handlerName,
        onSelectFile,
        fileNamePrefix,
        quality,
        onCancel,
      })
    } catch (bridgeError) {
      console.error(`Bridge ${handlerName} error:`, bridgeError)
      if (isCamera) {
        openBrowserCameraFallback(onSelectFile, fallbackInputRef)
      } else {
        openBrowserGalleryFallback(onSelectFile, fallbackInputRef)
      }
    }
    return
  }

  if (isCamera) {
    openBrowserCameraFallback(onSelectFile, fallbackInputRef)
    return
  }

  openBrowserGalleryFallback(onSelectFile, fallbackInputRef)
}

/**
 * Open camera via Flutter bridge or browser fallback
 */
export const openCamera = async ({
  onSelectFile,
  fileNamePrefix = "camera-photo",
  quality = 0.8,
  fallbackInputRef = null,
  onCancel,
}) => {
  return handleImageUpload({
    source: "camera",
    onSelectFile,
    fallbackInputRef,
    fileNamePrefix,
    quality,
    onCancel,
  })
}

/**
 * Open gallery via Flutter bridge (compressed images) or browser fallback
 */
export const openGallery = async ({
  onSelectFile,
  fileNamePrefix = "gallery-photo",
  fallbackInputRef = null,
  onCancel,
}) => {
  return handleImageUpload({
    source: "gallery",
    onSelectFile,
    fallbackInputRef,
    fileNamePrefix,
    onCancel,
  })
}
