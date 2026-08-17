const DEFAULT_MAX_WIDTH = 2048
const DEFAULT_MAX_HEIGHT = 2048
const DEFAULT_QUALITY = 0.88
const DEFAULT_MAX_BYTES = Math.floor(4.5 * 1024 * 1024)
const SMALL_SKIP_THRESHOLD = Math.floor(900 * 1024)
const MIN_QUALITY = 0.55
const QUALITY_STEP = 0.05

export const PROFILE_PRESET = {
  maxWidth: 1024,
  maxHeight: 1024,
  maxBytes: 2 * 1024 * 1024,
  quality: 0.88,
}

const PRESETS = {
  profile: PROFILE_PRESET,
}

const resolveOptions = (options = {}) => {
  let resolved = { ...options }
  if (options.preset && PRESETS[options.preset]) {
    resolved = { ...PRESETS[options.preset], ...options }
    delete resolved.preset
  }

  return {
    maxWidth: resolved.maxWidth ?? DEFAULT_MAX_WIDTH,
    maxHeight: resolved.maxHeight ?? DEFAULT_MAX_HEIGHT,
    quality: resolved.quality ?? DEFAULT_QUALITY,
    maxBytes: resolved.maxBytes ?? DEFAULT_MAX_BYTES,
  }
}

const isImageFile = (file) =>
  Boolean(file && String(file.type || "").startsWith("image/"))

const isGif = (file) => String(file?.type || "").toLowerCase() === "image/gif"

const shouldSkipCompression = (file, options) => {
  if (!isImageFile(file) || isGif(file)) return true

  const type = String(file.type || "").toLowerCase()
  const isWebpOrJpeg =
    type === "image/webp" || type === "image/jpeg" || type === "image/jpg"

  return (
    isWebpOrJpeg &&
    file.size <= SMALL_SKIP_THRESHOLD &&
    file.size <= options.maxBytes
  )
}

const loadImageSource = async (file) => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      }
    } catch {
      // Fall back to Image below.
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => {},
      })
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Failed to load image"))
    }

    img.src = objectUrl
  })
}

const computeDimensions = (width, height, maxWidth, maxHeight) => {
  let nextWidth = width
  let nextHeight = height

  if (nextWidth > maxWidth || nextHeight > maxHeight) {
    const ratio = Math.min(maxWidth / nextWidth, maxHeight / nextHeight)
    nextWidth = Math.max(1, Math.round(nextWidth * ratio))
    nextHeight = Math.max(1, Math.round(nextHeight * ratio))
  }

  return { width: nextWidth, height: nextHeight }
}

const canvasToBlob = (canvas, mimeType, quality) =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality)
  })

const encodeCanvas = async (canvas, quality) => {
  const webpBlob = await canvasToBlob(canvas, "image/webp", quality)
  if (webpBlob) {
    return { blob: webpBlob, ext: "webp", mime: "image/webp" }
  }

  const jpegBlob = await canvasToBlob(canvas, "image/jpeg", quality)
  if (jpegBlob) {
    return { blob: jpegBlob, ext: "jpg", mime: "image/jpeg" }
  }

  return null
}

const encodeWithinSizeLimit = async (canvas, startQuality, maxBytes) => {
  let quality = startQuality

  while (quality >= MIN_QUALITY) {
    const encoded = await encodeCanvas(canvas, quality)
    if (encoded?.blob && encoded.blob.size <= maxBytes) {
      return encoded
    }
    quality = Math.round((quality - QUALITY_STEP) * 100) / 100
  }

  const fallback = await encodeCanvas(canvas, MIN_QUALITY)
  if (fallback?.blob && fallback.blob.size <= maxBytes) {
    return fallback
  }

  return fallback
}

const toCompressedFile = (file, encoded) => {
  const baseName = String(file.name || "upload").replace(/\.[^/.]+$/, "") || "upload"
  return new File([encoded.blob], `${baseName}.${encoded.ext}`, {
    type: encoded.mime,
    lastModified: Date.now(),
  })
}

export const compressImageForUpload = async (file, options = {}) => {
  if (!file) return file

  const resolved = resolveOptions(options)
  if (shouldSkipCompression(file, resolved)) {
    return file
  }

  try {
    const { source, width, height, cleanup } = await loadImageSource(file)
    const target = computeDimensions(
      width,
      height,
      resolved.maxWidth,
      resolved.maxHeight,
    )

    const canvas = document.createElement("canvas")
    canvas.width = target.width
    canvas.height = target.height

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      cleanup()
      return file
    }

    ctx.drawImage(source, 0, 0, target.width, target.height)
    cleanup()

    const encoded = await encodeWithinSizeLimit(
      canvas,
      resolved.quality,
      resolved.maxBytes,
    )

    if (!encoded?.blob) {
      return file
    }

    if (encoded.blob.size >= file.size) {
      return file
    }

    return toCompressedFile(file, encoded)
  } catch {
    return file
  }
}

export const compressImagesForUpload = async (files, options = {}) => {
  const normalizedFiles = Array.from(files || []).filter(Boolean)
  return Promise.all(
    normalizedFiles.map((file) => compressImageForUpload(file, options)),
  )
}

export const prepareUploadFile = async (file, options = {}) =>
  compressImageForUpload(file, options)

export const prepareUploadFiles = async (files, options = {}) =>
  compressImagesForUpload(files, options)

export const appendCompressedImageToFormData = async (
  formData,
  fieldName,
  file,
  options = {},
) => {
  if (!formData || !fieldName || !file) return formData
  formData.append(fieldName, await prepareUploadFile(file, options))
  return formData
}

export const appendCompressedImagesToFormData = async (
  formData,
  fieldName,
  files,
  options = {},
) => {
  if (!formData || !fieldName) return formData
  const preparedFiles = await prepareUploadFiles(files, options)
  preparedFiles.forEach((file) => formData.append(fieldName, file))
  return formData
}
