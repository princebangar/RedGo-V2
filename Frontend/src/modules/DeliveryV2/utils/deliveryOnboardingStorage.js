import { clearModuleAuth } from "@food/utils/auth"

export const DELIVERY_SIGNUP_DOC_TYPES = [
  "profilePhoto",
  "aadharPhoto",
  "panPhoto",
  "drivingLicensePhoto",
]

const ONBOARDING_SESSION_KEYS = [
  "deliverySignupDetails",
  "deliverySignupDocs",
  "deliveryNeedsRegistration",
  "deliveryAuthData",
]

const DELIVERY_FILES_DB = "DeliveryOnboardingFiles"
const DELIVERY_FILES_STORE = "files"

const openDeliveryFilesDB = () =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("IndexedDB connection timeout"))
    }, 3000)

    try {
      if (typeof indexedDB === "undefined") {
        clearTimeout(timeout)
        reject(new Error("IndexedDB not supported"))
        return
      }

      const request = indexedDB.open(DELIVERY_FILES_DB, 1)
      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(DELIVERY_FILES_STORE)) {
          db.createObjectStore(DELIVERY_FILES_STORE)
        }
      }
      request.onsuccess = (event) => {
        clearTimeout(timeout)
        resolve(event.target.result)
      }
      request.onerror = (event) => {
        clearTimeout(timeout)
        reject(event.target.error)
      }
      request.onblocked = () => {
        clearTimeout(timeout)
        reject(new Error("IndexedDB blocked"))
      }
    } catch (error) {
      clearTimeout(timeout)
      reject(error)
    }
  })

const isUploadableFile = (file) => file instanceof File || file instanceof Blob

export const prepareSignupDocumentFile = async (file) => {
  if (!isUploadableFile(file) || !String(file.type || "").startsWith("image/")) {
    throw new Error("Invalid image file")
  }

  const maxBytes = 1.5 * 1024 * 1024
  const maxDimension = 1600

  if (file.size <= 400 * 1024) {
    return file instanceof File ? file : new File([file], "document.jpg", { type: file.type || "image/jpeg" })
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height, 1))
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale))
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext("2d")
    if (!context) {
      bitmap.close?.()
      return file instanceof File ? file : new File([file], "document.jpg", { type: file.type || "image/jpeg" })
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    bitmap.close?.()

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Image compression failed"))),
        "image/jpeg",
        0.82,
      )
    })

    if (!blob || blob.size >= file.size) {
      return file instanceof File ? file : new File([file], "document.jpg", { type: file.type || "image/jpeg" })
    }

    if (blob.size > maxBytes) {
      return file instanceof File ? file : new File([file], "document.jpg", { type: file.type || "image/jpeg" })
    }

    const baseName = String(file.name || "document").replace(/\.[^.]+$/, "")
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" })
  } catch {
    return file instanceof File ? file : new File([file], "document.jpg", { type: file.type || "image/jpeg" })
  }
}

export const saveSignupDocumentToDB = async (docType, file) => {
  if (!DELIVERY_SIGNUP_DOC_TYPES.includes(docType) || !isUploadableFile(file)) return

  const db = await openDeliveryFilesDB()
  const tx = db.transaction(DELIVERY_FILES_STORE, "readwrite")
  tx.objectStore(DELIVERY_FILES_STORE).put(file, docType)
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"))
    tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"))
  })
}

export const getSignupDocumentFromDB = async (docType) => {
  if (!DELIVERY_SIGNUP_DOC_TYPES.includes(docType)) return null

  try {
    const db = await openDeliveryFilesDB()
    const tx = db.transaction(DELIVERY_FILES_STORE, "readonly")
    const request = tx.objectStore(DELIVERY_FILES_STORE).get(docType)
    return await new Promise((resolve) => {
      request.onsuccess = () => {
        const result = request.result
        resolve(isUploadableFile(result) ? result : null)
      }
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export const deleteSignupDocumentFromDB = async (docType) => {
  if (!DELIVERY_SIGNUP_DOC_TYPES.includes(docType)) return

  try {
    const db = await openDeliveryFilesDB()
    const tx = db.transaction(DELIVERY_FILES_STORE, "readwrite")
    tx.objectStore(DELIVERY_FILES_STORE).delete(docType)
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("IndexedDB delete failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB delete aborted"))
    })
  } catch {
    // Ignore delete failures during cleanup.
  }
}

export const clearSignupDocumentsFromDB = async () => {
  try {
    if (typeof indexedDB === "undefined") return
    await Promise.all(DELIVERY_SIGNUP_DOC_TYPES.map((docType) => deleteSignupDocumentFromDB(docType)))
  } catch {
    try {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DELIVERY_FILES_DB)
        request.onsuccess = () => resolve(true)
        request.onerror = () => reject(request.error)
        request.onblocked = () => resolve(true)
      })
    } catch {
      // Ignore cleanup failures.
    }
  }
}

const deserializeLegacySignupDocument = (stored) => {
  if (!stored) return null

  const dataUrl =
    typeof stored === "string"
      ? stored
      : typeof stored?.dataUrl === "string"
        ? stored.dataUrl
        : ""

  if (!dataUrl.startsWith("data:image")) return null

  try {
    const [header, base64] = dataUrl.split(",")
    const mimeType = stored?.type || header.match(/:(.*?);/)?.[1] || "image/jpeg"
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    return new File([bytes], stored?.name || "document.jpg", { type: mimeType })
  } catch {
    return null
  }
}

const migrateLegacySignupDocsToIndexedDB = async () => {
  if (typeof sessionStorage === "undefined") return

  try {
    const saved = sessionStorage.getItem("deliverySignupDocs")
    if (!saved) return

    const parsed = JSON.parse(saved)
    let migrated = false

    for (const docType of DELIVERY_SIGNUP_DOC_TYPES) {
      const legacyFile = deserializeLegacySignupDocument(parsed?.[docType])
      if (legacyFile) {
        const prepared = await prepareSignupDocumentFile(legacyFile)
        await saveSignupDocumentToDB(docType, prepared)
        migrated = true
      }
    }

    if (migrated) {
      sessionStorage.removeItem("deliverySignupDocs")
    }
  } catch {
    sessionStorage.removeItem("deliverySignupDocs")
  }
}

export const loadSignupDocumentPreviews = async () => {
  await migrateLegacySignupDocsToIndexedDB()

  const previews = {}

  for (const docType of DELIVERY_SIGNUP_DOC_TYPES) {
    const file = await getSignupDocumentFromDB(docType)
    if (file) {
      previews[docType] = URL.createObjectURL(file)
    }
  }

  return previews
}

export const hasDeliveryStep1Progress = (formData = {}) => {
  const textFields = [
    "name",
    "email",
    "address",
    "city",
    "state",
    "vehicleName",
    "vehicleNumber",
    "drivingLicenseNumber",
    "panNumber",
    "aadharNumber",
  ]

  if (textFields.some((field) => String(formData[field] || "").trim())) {
    return true
  }

  if (formData.vehicleType && formData.vehicleType !== "bike") {
    return true
  }

  return false
}

const getOnboardingPhoneDigits = () => {
  if (typeof sessionStorage === "undefined") return ""

  try {
    const details = JSON.parse(sessionStorage.getItem("deliverySignupDetails") || "{}")
    return String(details.phone || "").replace(/\D/g, "")
  } catch {
    return ""
  }
}

export async function clearDeliveryOnboardingData() {
  if (typeof sessionStorage !== "undefined") {
    const phone = getOnboardingPhoneDigits()

    ONBOARDING_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key))

    if (phone) {
      sessionStorage.removeItem(`delivery_block_expires_at_${phone}`)
      sessionStorage.removeItem(`delivery_resend_expires_at_${phone}`)
    }

    sessionStorage.removeItem("delivery_block_expires_at")
    sessionStorage.removeItem("delivery_resend_expires_at")
  }

  await clearSignupDocumentsFromDB()
  clearModuleAuth("delivery")
}
