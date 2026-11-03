import React, { useState, useEffect } from "react";
import { X, Loader2, BadgeCheck, Phone, Bike, CalendarDays, Hash, ShieldCheck } from "lucide-react";
import { deliveryAPI } from "@food/api";
import { toast } from "sonner";
import { useCompanyName } from "@food/hooks/useCompanyName";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";

export default function ShowIdCardV2() {
  const companyName = useCompanyName();
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);

  // Fetch delivery partner profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getProfile();
        
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfileData(response.data.data.profile);
        } else {
          toast.error("Failed to load profile data");
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("Failed to load ID card data");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Format date for validity
  const formatValidDate = () => {
    if (!profileData?.createdAt) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const createdDate = new Date(profileData.createdAt);
    const validTill = new Date(createdDate);
    validTill.setFullYear(validTill.getFullYear() + 1);
    return validTill.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Get status display
  const getStatusDisplay = () => {
    if (!profileData) return "Active";
    const status = profileData.status?.toLowerCase() || (profileData.isActive ? 'active' : 'inactive');
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // Status chip colours (inline styles, so the delivery theme cannot repaint them)
  const getStatusTone = () => {
    const status = profileData?.status?.toLowerCase() || (profileData?.isActive ? 'active' : 'inactive');
    if (status === 'active' || status === 'approved') return { bg: "#dcfce7", text: "#15803d", border: "#bbf7d0", verified: true };
    if (status === 'pending') return { bg: "#fef9c3", text: "#a16207", border: "#fde68a", verified: false };
    if (status === 'suspended' || status === 'blocked' || status === 'rejected') return { bg: "#fee2e2", text: "#b91c1c", border: "#fecaca", verified: false };
    return { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0", verified: false };
  };

  const getProfileImageUrl = () => {
    if (profileData?.profileImage?.url) return profileData.profileImage.url;
    if (profileData?.documents?.photo) return profileData.documents.photo;
    return "/images/profile-avatar.webp";
  };

  // Get vehicle display text
  const getVehicleDisplay = () => {
    if (!profileData?.vehicle) return null;
    const vehicle = profileData.vehicle;
    const parts = [];
    if (vehicle.type) parts.push(vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1));
    if (vehicle.number) parts.push(vehicle.number);
    return parts.length > 0 ? parts.join(" - ") : null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <p className="text-gray-600">Loading ID card...</p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Failed to load ID card data</p>
          <button onClick={goBack} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Go Back</button>
        </div>
      </div>
    );
  }

  const idCardData = {
    name: profileData.name || "Delivery Partner",
    id: profileData.deliveryId || profileData._id?.toString().slice(-8).toUpperCase() || "N/A",
    phone: profileData.phone || "N/A",
    status: getStatusDisplay(),
    statusTone: getStatusTone(),
    validTill: formatValidDate(),
    vehicle: getVehicleDisplay(),
    profileImage: getProfileImageUrl()
  };

  const details = [
    { label: "Partner ID", value: idCardData.id, Icon: Hash },
    { label: "Mobile", value: idCardData.phone, Icon: Phone },
    idCardData.vehicle ? { label: "Vehicle", value: idCardData.vehicle, Icon: Bike } : null,
    { label: "Valid till", value: idCardData.validTill, Icon: CalendarDays },
  ].filter(Boolean);

  // Colours are inline on purpose: the delivery theme (deliveryTheme.css) rewrites Tailwind
  // green/orange classes with !important (bg-green-500 became light blue under white text).
  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-5 pb-10" style={{ background: "#eef3fb" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-base font-bold" style={{ color: "#0f1724" }}>My ID Card</h1>
          <button
            onClick={goBack}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm active:scale-95 transition-transform"
            style={{ border: "1px solid #d1dceb" }}
          >
            <X className="w-5 h-5" style={{ color: "#0f1724" }} />
          </button>
        </div>

        <div className="bg-white overflow-hidden rounded-[28px] shadow-[0_18px_40px_-18px_rgba(17,39,67,0.35)]" style={{ border: "1px solid #e3eaf5" }}>
          {/* Header band */}
          <div className="relative h-32 overflow-hidden" style={{ background: "linear-gradient(135deg, #15498b 0%, #0b2a52 100%)" }}>
            <div className="absolute -right-10 -top-12 w-40 h-40 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="absolute -left-8 bottom-[-60px] w-36 h-36 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="relative flex items-start justify-between px-5 pt-4">
              <div>
                <p className="text-[15px] font-black uppercase tracking-[0.18em] text-white">{companyName}</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.7)" }}>Delivery Partner ID</p>
              </div>
              <ShieldCheck className="w-7 h-7" style={{ color: "rgba(255,255,255,0.85)" }} />
            </div>
          </div>

          {/* Photo */}
          <div className="flex justify-center -mt-14 relative">
            <div className="p-1 bg-white rounded-full shadow-[0_10px_24px_-10px_rgba(17,39,67,0.45)]">
              <img
                src={idCardData.profileImage}
                alt={idCardData.name}
                className="w-28 h-28 rounded-full object-cover"
                style={{ border: "3px solid #e7effa" }}
                onError={(e) => {
                  e.target.src = "/images/profile-avatar.webp";
                }}
              />
            </div>
          </div>

          {/* Name + status */}
          <div className="flex flex-col items-center text-center px-5 mt-3">
            <h2 className="text-[22px] font-black uppercase leading-tight tracking-tight" style={{ color: "#0f1724" }}>{idCardData.name}</h2>
            <span
              className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ background: idCardData.statusTone.bg, color: idCardData.statusTone.text, border: `1px solid ${idCardData.statusTone.border}` }}
            >
              {idCardData.statusTone.verified ? (
                <BadgeCheck className="w-4 h-4" style={{ color: idCardData.statusTone.text }} />
              ) : (
                <span className="w-2 h-2 rounded-full" style={{ background: idCardData.statusTone.text }} />
              )}
              {idCardData.status}
            </span>
          </div>

          {/* Details */}
          <div className="mx-5 mt-5 rounded-[20px] overflow-hidden" style={{ background: "#f5f8fd", border: "1px solid #e3eaf5" }}>
            {details.map(({ label, value, Icon }, i) => (
              <div
                key={label}
                className="flex items-center gap-3 px-4 py-3"
                style={i > 0 ? { borderTop: "1px solid #e3eaf5" } : undefined}
              >
                <span className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center" style={{ background: "#e7effa" }}>
                  <Icon className="w-4 h-4" style={{ color: "#15498b" }} />
                </span>
                <span className="text-[12px] font-semibold" style={{ color: "#4f5f77" }}>{label}</span>
                <span className="ml-auto text-[13px] font-bold text-right uppercase break-all" style={{ color: "#0f1724" }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="px-5 pt-4 pb-5 text-center text-[11px] font-medium leading-relaxed" style={{ color: "#7a889c" }}>
            This ID card is issued for essential delivery services only.
          </p>
        </div>
      </div>
    </div>
  );
}
