#!/usr/bin/env python3
"""
STL → STEP converter with:
 - Mesh repair
 - Planar face merging
 - ABSOLUTELY CLEAN JSON OUTPUT ONLY
 - No progress bars
 - FreeCAD >= 0.21 compatible
"""

import sys
import os
import json

# ─────────────────────────────────────────────────────────────
# Disable ALL FreeCAD console spam BEFORE importing modules
# ─────────────────────────────────────────────────────────────
os.environ["FC_NO_CONSOLE_MSG"] = "1"

import FreeCAD
import Part
import Mesh
import MeshPart
import Import


def json_exit(obj):
    """Guaranteed clean JSON. No other output reaches stdout."""
    sys.stdout.write(json.dumps(obj))
    sys.stdout.flush()
    os._exit(0)


def get_mesh_info(mesh):
    return {
        "points": mesh.CountPoints,
        "facets": mesh.CountFacets,
        "edges": mesh.CountEdges,
        "is_solid": mesh.isSolid(),
        "has_non_manifolds": mesh.hasNonManifolds(),
        "has_self_intersections": mesh.hasSelfIntersections(),
        "volume": mesh.Volume if mesh.isSolid() else None,
        "area": mesh.Area,
    }


def repair_mesh(mesh):
    repairs = []

    before = mesh.CountPoints
    mesh.removeDuplicatedPoints()
    after = mesh.CountPoints
    if after != before:
        repairs.append(f"Removed {before - after} duplicated points")

    before = mesh.CountFacets
    mesh.removeDuplicatedFacets()
    after = mesh.CountFacets
    if after != before:
        repairs.append(f"Removed {before - after} duplicated facets")

    if mesh.hasSelfIntersections():
        mesh.fixSelfIntersections()
        repairs.append("Fixed self-intersections")

    mesh.fixDegenerations()
    repairs.append("Fixed degenerations")

    if mesh.hasNonManifolds():
        mesh.removeNonManifolds()
        repairs.append("Removed non-manifolds")

    mesh.fillupHoles()
    repairs.append("Filled holes")

    mesh.harmonizeNormals()
    repairs.append("Harmonized normals")

    return repairs


def merge_planar(shape):
    try:
        new_shape = shape.removeSplitter()
        return new_shape, True
    except:
        return shape, False


def convert(input_path, output_path, tolerance, repair, info_only):
    out = {
        "success": False,
        "input": input_path,
        "output": output_path,
        "tolerance": tolerance
    }

    if not os.path.exists(input_path):
        out["error"] = "Input file not found"
        out["stage"] = "validation"
        json_exit(out)

    mesh = Mesh.Mesh()
    mesh.read(input_path)

    if mesh.CountFacets == 0:
        out["error"] = "STL contains no geometry"
        out["stage"] = "read"
        json_exit(out)

    out["mesh_info_before"] = get_mesh_info(mesh)

    if info_only:
        out["success"] = True
        json_exit(out)

    if repair:
        out["repairs"] = repair_mesh(mesh)
        out["mesh_info_after"] = get_mesh_info(mesh)

    # Create FreeCAD doc
    doc = FreeCAD.newDocument("ConvertDoc")

    # ──────────────────────────────────────────────────────
    # FIX FOR YOUR ERROR:
    # makeShapeFromMesh() REQUIRES 4 args in FreeCAD >= 0.21
    # ──────────────────────────────────────────────────────
    shape = Part.Shape()
    shape.makeShapeFromMesh(mesh.Topology, tolerance, False, True)

    # Try to solidify
    try:
        solid = Part.makeSolid(shape)
        final_shape = solid
        out["is_solid"] = True
    except:
        final_shape = shape
        out["is_solid"] = False

    # Merge coplanar triangles
    final_shape, merged = merge_planar(final_shape)
    out["merged_planar_faces"] = merged

    # Export
    obj = doc.addObject("Part::Feature", "Body")
    obj.Shape = final_shape

    Import.export([obj], output_path)

    if os.path.exists(output_path):
        out["success"] = True
        out["output_size"] = os.path.getsize(output_path)
    else:
        out["error"] = "STEP export failed"
        out["stage"] = "export"

    FreeCAD.closeDocument("ConvertDoc")
    json_exit(out)


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        json_exit({"success": False, "error": "Invalid arguments"})

    input_path = args[0]
    output_path = args[1]

    tolerance = 0.01
    repair = True
    info_only = False

    for a in args[2:]:
        if a.startswith("--tolerance="):
            tolerance = float(a.split("=")[1])
        elif a == "--repair":
            repair = True
        elif a == "--no-repair":
            repair = False
        elif a == "--info":
            info_only = True

    convert(input_path, output_path, tolerance, repair, info_only)


if __name__ == "__main__":
    main()
