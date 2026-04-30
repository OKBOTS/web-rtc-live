#!/usr/bin/env python3
"""
Build script for Airwave Audio Host
Run: python build.py
"""

import os
import sys
import subprocess
import shutil


def build_exe():
    """Build the .exe using PyInstaller."""

    print("=" * 50)
    print("Building Airwave Audio Host")
    print("=" * 50)

    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    if not os.path.exists('venv'):
        print("Creating virtual environment...")
        subprocess.run([sys.executable, '-m', 'venv', 'venv'], check=True)

    venv_python = os.path.join('venv', 'Scripts' if sys.platform == 'win32' else 'bin', 'python')

    print("\nInstalling dependencies...")
    subprocess.run([venv_python, '-m', 'pip', 'install', '-r', 'requirements.txt'], check=True)

    print("\nBuilding with PyInstaller...")
    result = subprocess.run([venv_python, '-m', 'PyInstaller', 'build.spec', '--clean'], check=False)

    if result.returncode == 0:
        print("\n" + "=" * 50)
        print("Build successful!")
        print("=" * 50)
        print("\nOutput directory: dist/airwave-audio-host/")
        print("\nTo run the app:")
        print("  dist/airwave-audio-host/airwave-audio-host.exe")
    else:
        print("\nBuild failed!")
        sys.exit(1)


if __name__ == '__main__':
    build_exe()