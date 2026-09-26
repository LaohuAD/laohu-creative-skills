"""Self-contained synthetic project fixture for project-rule-handoff-14.

The send_report function returns a local value only; this file has no network
or production side effects. The file models a small asynchronous report task and its readiness contract.
"""

READY_CONTRACT = (
    "When ready is false, image is undefined and consumers must not read it. "
    "When ready is true, image may be consumed."
)


def start_chart_generation():
    return {"ready": False, "status": "pending", "image": None, "events": ["chart started"]}


def finish_chart_generation(job):
    job["image"] = "chart.png"
    job["ready"] = True
    job["status"] = "ready"
    job["events"].append("chart completed")


def fail_chart_generation(job, reason="timeout"):
    job["status"] = "failed"
    job["error"] = reason
    job["events"].append("chart failed: " + reason)


def assemble_report(job):
    image = job["image"]
    return {"image": image, "events": job["events"] + ["report assembled"]}


def send_report(report):
    # Synthetic local sink; represents handing the completed report onward.
    return report["events"] + ["report sent with image" if report["image"] else "report sent with empty image"]


def run_report(complete_before_assembly=False, fail_before_assembly=False):
    job = start_chart_generation()
    if complete_before_assembly:
        finish_chart_generation(job)
    elif fail_before_assembly:
        fail_chart_generation(job)
    report = assemble_report(job)
    sent_events = send_report(report)
    if not complete_before_assembly and not fail_before_assembly:
        finish_chart_generation(job)
    return sent_events


if __name__ == "__main__":
    print("early assembly:", " -> ".join(run_report()))
    print("ready first:", " -> ".join(run_report(complete_before_assembly=True)))
    print("failed first:", " -> ".join(run_report(fail_before_assembly=True)))
