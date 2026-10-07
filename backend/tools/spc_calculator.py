"""ADK Tool: Statistical Process Control calculations and post-repair consecutive good-product streak counter."""

from typing import List, Dict, Any

def calculate_spc_ucl(historical_defect_rates: List[float]) -> float:
    """
    Calculates the Upper Control Limit (UCL) for a p-chart (proportion defective).
    Simplified mock: just taking mean + 3 * stddev.
    """
    if not historical_defect_rates:
        return 0.03 # Default to 3.0%
        
    mean = sum(historical_defect_rates) / len(historical_defect_rates)
    
    # Calculate sample standard deviation
    variance = sum((x - mean) ** 2 for x in historical_defect_rates) / len(historical_defect_rates)
    stddev = variance ** 0.5
    
    ucl = mean + (3 * stddev)
    
    # Cap at a reasonable percentage for the demo, e.g., max 10%
    return min(ucl, 0.1)

def verify_post_repair_streak(consecutive_passes: int, target: int = 50) -> Dict[str, Any]:
    """
    Verifies if the post-repair good-product streak has met the target.
    """
    success = consecutive_passes >= target
    return {
        "success": success,
        "consecutive_passes": consecutive_passes,
        "target": target,
        "message": f"Physical recovery verified: {consecutive_passes} consecutive defect-free products passed." if success else f"Verification pending: {consecutive_passes}/{target} passes."
    }
