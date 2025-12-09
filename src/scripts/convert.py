#!/usr/bin/env python3

import sys
import os
import argparse
import json
import io

# --------------------------
# HARD MUTE FREECAD OUTPUT
# --------------------------

class StdoutSuppressor:
    def __init__(self):
        self.real_stdout = sys.stdout
        self.real_stderr = sys.stderr
        self.fake = io.StringIO()

    def suppress(self):
        sys.stdout = self.fake
        sys.stderr = self.fake

    def restore(self):
        sys.stdout = self.real_stdout
        sys.stderr = self.real_stderr


mute = StdoutSuppressor()
mute.suppress()

# Import FreeCAD quietly
try:
    import FreeCAD
    import Part
    import Mesh
    import MeshPart
    import Import
except Exception as e:
    mute.restore()
    print(json.dumps({
        "success": False,
        "error": f"FreeCAD import failed: {str(e)}",
        "stage": "import"
    }))
    sys.exit(0)


# --------------------------
# FORCE CLEAN JSON EXIT
# --------------------------

def clean_exit(result):
    """Restores stdout, prints JSON, hard-exits before FreeCAD pollutes output."""
    mute.restore()
    print(json.dumps(result, indent=2))
    sys.stdout.flush()
    os._exit(0)


# --------------------------
# UTILITY FUNCTIONS
# --------------------------

def get_mesh_info(mesh):
    return {
        "points": mesh.CountPoints,
        "facets": mesh.CountFacets,
        "edges": mesh.CountEdges,
        "is_solid": mesh.isSolid(),
        "has_non_manifolds": mesh.hasNonManifolds(),
        "has_self_intersections": mesh.hasSelfIntersections(),
        "volume": mesh.Volume if mesh.isSolid() else None,
        "area": mesh.Area
    }


def repair_mesh(mesh):
    repairs = []

    before_pts = mesh.CountPoints
    mesh.removeDuplicatedPoints()
    if mesh.CountPoints < before_pts:
        repairs.append(f"Removed {before_pts - mesh.CountPoints} duplicate points")

    before_f = mesh.CountFacets
    mesh.removeDuplicatedFacets()
    if mesh.CountFacets < before_f:
        repairs.append(f"Removed {before_f - mesh.CountFacets} duplicate facets")

    if mesh.hasSelfIntersections():
        mesh.fixSelfIntersections()
        if not mesh.hasSelfIntersections():
            repairs.append("Fixed self-intersections")

    mesh.fixDegenerations(0.0, True)
    repairs.append("Fixed degenerations")

    if mesh.hasNonManifolds():
        mesh.removeNonManifolds()
        if not mesh.hasNonManifolds():
            repairs.append("Removed non-manifolds")

    mesh.fillupHoles()
    repairs.append("Filled holes")

    mesh.harmonizeNormals()
    repairs.append("Harmonized normals")

    return mesh, repairs


def merge_planar_faces(shape):
    try:
        merged = shape.removeSplitter()
        return merged, True
    except Exception:
        return shape, False


# --------------------------
# MAIN CONVERSION LOGIC
# --------------------------

def convert(input_path, output_path, tolerance=0.01, repair=True, info_only=False):
    result = {
        "success": False,
        "input": input_path,
        "output": output_path,
        "tolerance": tolerance
    }

    if not os.path.exists(input_path):
        result["error"] = "Input file not found"
        clean_exit(result)

    mesh = Mesh.Mesh()
    mesh.read(input_path)

    if mesh.CountFacets == 0:
        result["error"] = "STL contains no facets"
        clean_exit(result)

    result["mesh_info_before"] = get_mesh_info(mesh)

    if info_only:
        result["success"] = True
        clean_exit(result)

    if repair:
        mesh, repairs = repair_mesh(mesh)
        result["repairs"] = repairs
        result["mesh_info_after"] = get_mesh_info(mesh)

    doc = FreeCAD.newDocument("Job")

    shape = Part.Shape()
    shape.makeShapeFromMesh(mesh.Topology, tolerance)

    # Try to solidify
    try:
        solid = Part.makeSolid(shape)
        final = solid
        result["is_solid"] = True
    except Exception:
        final = shape
        result["is_solid"] = False

    final, merged_ok = merge_planar_faces(final)
    result["merged_planar_faces"] = merged_ok

    obj = doc.addObject("Part::Feature", "Mesh")
    obj.Shape = final

    Import.export([obj], output_path)

    if not os.path.exists(output_path):
        result["error"] = "STEP export failed"
        clean_exit(result)

    result["success"] = True
    result["output_size"] = os.path.getsize(output_path)

    clean_exit(result)


# --------------------------
# CLI ENTRY
# --------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--tolerance", type=float, default=0.01)
    parser.add_argument("--repair", action="store_true", default=True)
    parser.add_argument("--no-repair", action="store_false", dest="repair")
    parser.add_argument("--info", action="store_true")
    args = parser.parse_args()

    convert(args.input, args.output, args.tolerance, args.repair, args.info)


if __name__ == "__main__":
    main()
