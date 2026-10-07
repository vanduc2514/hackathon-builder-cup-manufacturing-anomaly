"""ADK Tool: Computes avoided scrap parts, downtime savings, kWh electricity, and CO2 emission reductions."""

from backend.core.models import ImpactMetrics

def calculate_impact(defect_rate_reduction: float, typical_daily_volume: int = 5000) -> ImpactMetrics:
    """
    Calculates sustainability metrics based on the defect rate reduction.
    """
    # Simplified mock logic for demonstration
    scrap_avoided = int(typical_daily_volume * defect_rate_reduction)
    
    # Assume 1 scrap part takes 2 minutes to produce, consumes 1 kWh, emits 0.5 kg CO2
    downtime_minutes = scrap_avoided * 2
    energy_kwh = scrap_avoided * 1.5
    co2_kg = energy_kwh * 0.4
    
    return ImpactMetrics(
        scrap_avoided=scrap_avoided,
        downtime_minutes=downtime_minutes,
        energy_kwh=round(energy_kwh, 1),
        co2_kg=round(co2_kg, 1)
    )
